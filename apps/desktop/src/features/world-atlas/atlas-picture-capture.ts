/** Capture only the Atlas's own chart surfaces, never the desktop or journal UI.
 * Public chart images are flattened into inert PNG before they reach SQLite.
 */
const SVG_TAGS = new Set([
  "svg",
  "g",
  "path",
  "circle",
  "rect",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "clipPath",
  "pattern",
  "linearGradient",
  "radialGradient",
  "stop",
  "title",
  "desc",
]);
const STYLE_KEYS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "visibility",
  "display",
  "stop-color",
  "stop-opacity",
];

function svgImage(svg: SVGSVGElement, width: number, height: number) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...svg.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  copies.forEach((copy, index) => {
    if (!SVG_TAGS.has(copy.tagName)) {
      copy.remove();
      return;
    }
    for (const attr of [...copy.attributes]) {
      if (
        /^on/i.test(attr.name) ||
        ["href", "xlink:href", "style"].includes(attr.name)
      )
        copy.removeAttribute(attr.name);
    }
    const style = getComputedStyle(originals[index]);
    const inline = STYLE_KEYS.flatMap((key) => {
      let value = style.getPropertyValue(key);
      if (/url\(/i.test(value)) {
        const fragment = value.match(/#([\w:-]+)["']?\)/)?.[1];
        if (!fragment) return [];
        value = `url(#${fragment})`;
      }
      return value ? [`${key}:${value}`] : [];
    }).join(";");
    copy.setAttribute("style", inline);
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(clone);
}

function loadSvg(xml: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(
      new Blob([xml], { type: "image/svg+xml;charset=utf-8" }),
    );
    const image = new Image();
    const end = () => {
      URL.revokeObjectURL(url);
      clearTimeout(timeout);
    };
    const timeout = window.setTimeout(() => {
      end();
      reject(
        new Error(
          "Ein Diagramm konnte nicht rechtzeitig als Bild gelesen werden.",
        ),
      );
    }, 8000);
    image.onload = () => {
      end();
      resolve(image);
    };
    image.onerror = () => {
      end();
      reject(new Error("Ein Diagramm konnte nicht als Bild gelesen werden."));
    };
    image.src = url;
  });
}

function canvas(width: number, height: number) {
  const value = document.createElement("canvas");
  value.width = Math.max(1, Math.round(width));
  value.height = Math.max(1, Math.round(height));
  return value;
}

export async function captureAtlasPictures(
  root: HTMLElement,
  label: string,
  maximumBytes = 2 * 1024 * 1024,
): Promise<string | null> {
  const elements = [
    ...root.querySelectorAll<HTMLElement | SVGSVGElement>('[role="img"]'),
  ].filter(
    (el) =>
      !el.parentElement?.closest('[role="img"]') &&
      (el instanceof SVGSVGElement || el.querySelector("canvas")),
  );
  if (!elements.length) return null;
  if (elements.length > 80)
    throw new Error(
      "Bitte die Ansicht auf weniger Diagramme eingrenzen, um einen lesbaren Bildstand zu merken.",
    );
  // Clone every surface synchronously before awaiting SVG decoding. A subsequent
  // background refresh cannot mix an old chart with a later chart in this image.
  const frozen = elements.flatMap<{
    title: string;
    width: number;
    height: number;
    svg: string | null;
    image: HTMLCanvasElement | null;
  }>((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return [];
    const referenced = (el.getAttribute("aria-labelledby") ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) =>
        root.querySelector(`#${CSS.escape(id)}`)?.textContent?.trim(),
      )
      .filter(Boolean)
      .join(" · ");
    const unit = el
      .closest(".atlas-wave-card")
      ?.querySelector(".atlas-wave-card-scope")
      ?.textContent?.trim();
    const title = [
      el.getAttribute("aria-label") || referenced || "Atlasdiagramm",
      unit,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 800);
    if (el instanceof SVGSVGElement)
      return [
        {
          title,
          width: rect.width,
          height: rect.height,
          svg: svgImage(el, rect.width, rect.height),
          image: null as HTMLCanvasElement | null,
        },
      ];
    const image = canvas(rect.width, rect.height);
    const ctx = image.getContext("2d");
    if (!ctx) throw new Error("Der lokale Bildspeicher ist nicht verfügbar.");
    for (const layer of el.querySelectorAll("canvas")) {
      const bounds = layer.getBoundingClientRect();
      if (layer.width && layer.height && bounds.width && bounds.height)
        ctx.drawImage(
          layer,
          bounds.left - rect.left,
          bounds.top - rect.top,
          bounds.width,
          bounds.height,
        );
    }
    return [
      {
        title,
        width: rect.width,
        height: rect.height,
        svg: null as string | null,
        image,
      },
    ];
  });
  if (!frozen.length) return null;
  const householdLayout =
    frozen.length === elements.length &&
    elements.length > 1 &&
    elements.length <= 3 &&
    Boolean(elements[0].closest(".atlas-household-history")) &&
    elements.slice(1).every((el) => el.closest(".atlas-household-card"));
  const householdHistoryHeight = 330;
  const columns = frozen.length === 1 ? 1 : 2;
  const cellWidth = 960 / columns;
  const chartHeight = frozen.length === 1 ? 520 : 300;
  const cellHeight = chartHeight + 108;
  // These legends live outside the SVG/canvas in the interactive page.
  const legend = [
    ...root.querySelectorAll(
      ".atlas-statistics-legend > span, .atlas-energy-legend > li, .atlas-valuation-legend > span, .atlas-jst-legend > span, .atlas-fiscal-legend > span, .atlas-household-legend > span",
    ),
  ]
    .map((item) => {
      const swatch = item.querySelector("i, span[aria-hidden='true']");
      const style = swatch
        ? getComputedStyle(swatch)
        : getComputedStyle(item, "::before");
      const color = item.matches(
        ".atlas-jst-legend > span, .atlas-fiscal-legend > span, .atlas-household-legend > span",
      )
        ? getComputedStyle(item).color
        : style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)"
          ? style.backgroundColor
          : style.borderTopColor || "#b2c1d6";
      return {
        label: `${item.textContent?.trim() ?? ""}${item.classList.contains("is-comparison") ? " · gestrichelt" : ""}`,
        color,
      };
    })
    .filter((item) => item.label);
  const headerHeight = 104 + Math.ceil(legend.length / 3) * 26;
  const result = canvas(
    960,
    headerHeight +
      (householdLayout
        ? householdHistoryHeight + 108 + cellHeight
        : Math.ceil(frozen.length / columns) * cellHeight),
  );
  if (result.height > 16000)
    throw new Error("Bitte die Auswahl für den Bildstand eingrenzen.");
  const ctx = result.getContext("2d");
  if (!ctx) throw new Error("Der lokale Bildspeicher ist nicht verfügbar.");
  ctx.fillStyle = "#070d18";
  ctx.fillRect(0, 0, result.width, result.height);
  function text(
    text: string,
    x: number,
    y: number,
    width: number,
    lines: number,
  ) {
    const words = text.split(/\s+/);
    let line = "",
      row = 0;
    for (const [index, word] of words.entries()) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx!.measureText(candidate).width > width && line) {
        ctx!.fillText(line, x, y + row * 17, width);
        row++;
        line = word;
        if (row >= lines - 1) {
          const rest = words.slice(index + 1).join(" ");
          line = `${word} ${rest}`.trim();
          while (ctx!.measureText(`${line} …`).width > width && line.length)
            line = line.slice(0, -1);
          break;
        }
      } else line = candidate;
    }
    ctx!.fillText(
      row >= lines - 1 ? `${line} …` : line,
      x,
      y + row * 17,
      width,
    );
  }
  ctx.fillStyle = "#edf3fc";
  ctx.font = "600 18px system-ui";
  text(label, 20, 30, 920, 2);
  ctx.fillStyle = "#b2c1d6";
  ctx.font = "12px system-ui";
  ctx.fillText(
    "Gespeicherter Diagrammstand · Quellen und eigene Notiz sind separat hinterlegt",
    20,
    74,
  );
  legend.forEach((item, i) => {
    const x = 20 + (i % 3) * 310;
    const y = 94 + Math.floor(i / 3) * 26;
    ctx.fillStyle = item.color;
    ctx.fillRect(x, y - 8, 18, 4);
    ctx.fillStyle = "#b2c1d6";
    ctx.fillText(item.label, x + 26, y, 278);
  });
  for (let i = 0; i < frozen.length; i++) {
    const chart = frozen[i];
    const featured = householdLayout && i === 0;
    const width = featured ? 960 : cellWidth;
    const height = featured ? householdHistoryHeight : chartHeight;
    const tileIndex = householdLayout ? i - 1 : i;
    const x = featured ? 16 : (tileIndex % columns) * cellWidth + 16;
    const y =
      headerHeight +
      (featured
        ? 0
        : (householdLayout ? householdHistoryHeight + 108 : 0) +
          Math.floor(tileIndex / columns) * cellHeight);
    ctx.fillStyle = "#b2c1d6";
    ctx.font = "12px system-ui";
    text(chart.title, x, y + 16, width - 32, 4);
    const image = chart.image ?? (await loadSvg(chart.svg!));
    const scale = Math.min((width - 32) / chart.width, height / chart.height);
    const w = chart.width * scale,
      h = chart.height * scale;
    ctx.drawImage(image, x + (width - 32 - w) / 2, y + 84, w, h);
  }
  let encoded = result.toDataURL("image/png").split(",")[1];
  if (encoded.length > (maximumBytes * 4) / 3) {
    const small = canvas(720, result.height * 0.75);
    small.getContext("2d")!.drawImage(result, 0, 0, small.width, small.height);
    encoded = small.toDataURL("image/png").split(",")[1];
  }
  if (encoded.length > (maximumBytes * 4) / 3)
    throw new Error(
      "Der Bildstand ist zu groß. Du kannst die Ansicht ohne Bild oder mit weniger Diagrammen merken.",
    );
  return encoded;
}
