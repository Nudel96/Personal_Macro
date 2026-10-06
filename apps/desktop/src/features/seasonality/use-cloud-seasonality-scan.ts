import { useEffect, useRef, useState } from "react";
import { api } from "../../services/commands";
import type {
  SeasonalityOpportunityInput,
  SeasonalityOpportunityResponse,
  SeasonalityScreenerRow,
  SeasonalityScreenerInput,
} from "../../types/domain";
import {
  collectCloudBatches,
  mergeOpportunityBatches,
  mergeScreenerBatches,
} from "./cloud-seasonality-batches";
import { assertMarketWindowHorizon } from "./market-window-ranking";

interface ScanState<T> {
  key: string;
  data?: T;
  error?: Error;
  pending: boolean;
  completed: number;
  total: number;
}

function useExplicitScan<T>(
  key: string,
  calculate: (
    cancelled: () => boolean,
    progress: (completed: number, total: number) => void,
  ) => Promise<T>,
) {
  const token = useRef(0);
  const [state, setState] = useState<ScanState<T>>({
    key,
    pending: false,
    completed: 0,
    total: 0,
  });
  useEffect(
    () => () => {
      token.current += 1;
    },
    [key],
  );
  const current =
    state.key === key ? state : { key, pending: false, completed: 0, total: 0 };
  const refetch = async () => {
    const run = ++token.current;
    setState({ key, pending: true, completed: 0, total: 0 });
    try {
      const data = await calculate(
        () => token.current !== run,
        (completed, total) => {
          if (token.current === run)
            setState({ key, pending: true, completed, total });
        },
      );
      if (token.current === run)
        setState((previous) => ({ ...previous, key, data, pending: false }));
    } catch (error) {
      if (token.current === run)
        setState((previous) => ({
          ...previous,
          key,
          pending: false,
          error:
            error instanceof Error
              ? error
              : new Error("Die saisonale Berechnung ist fehlgeschlagen."),
        }));
    }
  };
  const cancel = () => {
    token.current += 1;
    setState((previous) => ({
      ...previous,
      key,
      pending: false,
      data: undefined,
      error: new Error(
        "Die Berechnung wurde abgebrochen. Es wird keine unvollständige Rangliste angezeigt.",
      ),
    }));
  };
  return {
    ...current,
    isPending: current.pending,
    isError: Boolean(current.error),
    refetch,
    cancel,
  };
}

export function useCloudScreener(
  generation?: string,
  input?: SeasonalityScreenerInput,
) {
  return useExplicitScan<SeasonalityScreenerRow[]>(
    JSON.stringify([generation, input]),
    async (cancelled, progress) => {
      if (!generation)
        throw new Error("Die Versionskennung des Datenstands fehlt.");
      const batches = await collectCloudBatches(
        generation,
        async (cursor) => {
          const batch = await api.seasonalityScreenerBatch({
            generation,
            cursor,
            limit: 5,
            ...(input ? { screenerInput: input } : {}),
          });
          return { ...batch, value: batch.rows };
        },
        cancelled,
        progress,
      );
      const rows = mergeScreenerBatches(batches);
      return input ? assertMarketWindowHorizon(rows, input.asOf) : rows;
    },
  );
}

export function useCloudOpportunities(
  generation: string | undefined,
  input: SeasonalityOpportunityInput,
) {
  return useExplicitScan<SeasonalityOpportunityResponse>(
    JSON.stringify([generation, input]),
    async (cancelled, progress) => {
      if (!generation)
        throw new Error("Die Versionskennung des Datenstands fehlt.");
      const batches = await collectCloudBatches(
        generation,
        async (cursor) => {
          const batch = await api.seasonalityOpportunitiesBatch({
            generation,
            cursor,
            limit: 5,
            input,
          });
          return { ...batch, value: batch.result };
        },
        cancelled,
        progress,
      );
      return mergeOpportunityBatches(batches);
    },
  );
}
