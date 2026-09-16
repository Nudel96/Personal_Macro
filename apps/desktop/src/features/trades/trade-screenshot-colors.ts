import type {
  ScreenshotWord,
  TradeScreenshotAnalysis,
  TradeScreenshotInput,
} from "../../types/domain";

export interface ScreenshotLabelColor {
  hue: number;
  filled: boolean;
}
export interface ColoredScreenshotWord extends ScreenshotWord {
  color?: ScreenshotLabelColor;
}
export interface ColoredScreenshotAnalysis extends TradeScreenshotAnalysis {
  lines: { text: string; words: ColoredScreenshotWord[] }[];
}

// Sample the original image, including a small margin around each OCR word.
// Saturated backgrounds and outlined, colored text both carry a label's hue.
// White letters, dark chart surfaces and grey scale ticks carry no trade role.
export function sampleScreenshotColors(
  analysis: TradeScreenshotAnalysis,
  pixels: { width: number; height: number; data: Uint8ClampedArray },
): ColoredScreenshotAnalysis {
  if (
    pixels.width !== analysis.width ||
    pixels.height !== analysis.height ||
    pixels.data.length !== pixels.width * pixels.height * 4
  )
    return analysis;

  return {
    ...analysis,
    lines: analysis.lines.map((line) => ({
      ...line,
      words: line.words.map((word) => {
        const left = Math.max(0, Math.floor(word.x - 2));
        const right = Math.min(
          pixels.width,
          Math.ceil(word.x + word.width + 2),
        );
        const top = Math.max(0, Math.floor(word.y - 2));
        const bottom = Math.min(
          pixels.height,
          Math.ceil(word.y + word.height + 2),
        );
        const bins = Array.from({ length: 36 }, () => ({
          count: 0,
          edge: 0,
          sin: 0,
          cos: 0,
        }));
        let edgePixels = 0;
        let total = 0;
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const edge = y < top + 2 || y >= bottom - 2;
            total++;
            if (edge) edgePixels++;
            const index = (y * pixels.width + x) * 4;
            const [r, g, b] = pixels.data.subarray(index, index + 3);
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const chroma = max - min;
            if (max < 95 || chroma < 45 || chroma / max < 0.35) continue;
            let hue =
              60 *
              (max === r
                ? ((g - b) / chroma) % 6
                : max === g
                  ? (b - r) / chroma + 2
                  : (r - g) / chroma + 4);
            hue = (hue + 360) % 360;
            const bin = bins[Math.round(hue / 10) % bins.length];
            bin.count++;
            if (edge) bin.edge++;
            bin.sin += Math.sin((hue * Math.PI) / 180);
            bin.cos += Math.cos((hue * Math.PI) / 180);
          }
        }
        const best = bins.reduce((a, b) => (a.count >= b.count ? a : b));
        if (best.count < Math.max(5, total * 0.055)) return word;
        return {
          ...word,
          color: {
            hue: ((Math.atan2(best.sin, best.cos) * 180) / Math.PI + 360) % 360,
            filled: best.edge / edgePixels >= 0.55 && best.count / total >= 0.4,
          },
        };
      }),
    })),
  };
}

export async function readScreenshotColors(
  analysis: TradeScreenshotAnalysis,
  dataUrl: string,
  recognizeScale?: (
    input: TradeScreenshotInput,
  ) => Promise<TradeScreenshotAnalysis>,
): Promise<ColoredScreenshotAnalysis> {
  if (!analysis.lines.some((line) => line.words.length)) return analysis;
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = analysis.width;
  canvas.height = analysis.height;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error(
        "Die Farben des Screenshots konnten nicht gelesen werden.",
      );
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const colored = sampleScreenshotColors(analysis, pixels);
    const axisWords = colored.lines
      .flatMap((line) => line.words)
      .filter(
        (word) =>
          word.x > analysis.width * 0.9 && /^\d+[.,]\d+$/.test(word.text),
      );
    if (
      !recognizeScale ||
      axisWords.length < 3 ||
      !axisWords.some((word) => word.color)
    )
      return colored;

    // Crowded scale labels can disappear in whole-chart OCR. Read that narrow
    // strip enlarged, in overlapping tiles so long screenshots stay legible.
    // These temporary crops never replace the saved original screenshot.
    const left = Math.max(
      0,
      Math.floor(
        Math.min(...axisWords.map((word) => word.x)) -
          Math.max(...axisWords.map((word) => word.width)) * 1.6,
      ),
    );
    const stripWidth = analysis.width - left;
    const crop = document.createElement("canvas");
    const extra: TradeScreenshotAnalysis["lines"] = [];
    try {
      for (let top = 0; top < analysis.height; top += 660) {
        const height = Math.min(700, analysis.height - top);
        crop.width = stripWidth * 3;
        crop.height = height * 3;
        const cropContext = crop.getContext("2d");
        if (!cropContext)
          throw new Error("Die Preisskala konnte nicht vergrößert werden.");
        cropContext.drawImage(
          canvas,
          left,
          top,
          stripWidth,
          height,
          0,
          0,
          crop.width,
          crop.height,
        );
        const result = await recognizeScale({
          filename: "TradingView-Preisskala.png",
          base64: crop.toDataURL("image/png").split(",")[1],
        });
        extra.push(
          ...result.lines.map((line) => ({
            text: line.text,
            words: line.words.map((word) => ({
              ...word,
              x: left + word.x / 3,
              y: top + word.y / 3,
              width: word.width / 3,
              height: word.height / 3,
            })),
          })),
        );
        if (top + height >= analysis.height) break;
      }
    } finally {
      crop.width = crop.height = 0;
    }
    return sampleScreenshotColors(
      { ...analysis, lines: [...analysis.lines, ...extra] },
      pixels,
    );
  } finally {
    canvas.width = canvas.height = 0;
  }
}
