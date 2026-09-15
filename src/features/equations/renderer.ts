import { mathjax } from "@mathjax/src/js/mathjax.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import type { EquationRenderResult } from "./models";

const EQUATION_EM_SIZE = 16;
const EQUATION_EX_SIZE = 8;
const EQUATION_SCALE = 2;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

type MathJaxRenderer = {
  adaptor: ReturnType<typeof liteAdaptor>;
  document: ReturnType<typeof mathjax.document>;
};

let renderer: MathJaxRenderer | null = null;

function getRenderer(): MathJaxRenderer {
  if (renderer) {
    return renderer;
  }

  const adaptor = liteAdaptor({ fontSize: EQUATION_EM_SIZE });
  RegisterHTMLHandler(adaptor);

  const tex = new TeX({
    packages: ["base", "ams"],
    formatError(_jax: unknown, error: { message: string }) {
      throw new Error(error.message);
    },
  });
  const svg = new SVG({
    fontCache: "local",
    useXlink: false,
  });

  renderer = {
    adaptor,
    document: mathjax.document("", {
      InputJax: tex,
      OutputJax: svg,
    }),
  };

  return renderer;
}

function readDimension(value: string | null, name: string): number {
  if (!value) {
    throw new Error(`MathJax did not provide an SVG ${name}.`);
  }

  const match = value.trim().match(/^(\d+(?:\.\d+)?)(px|ex|em)?$/);

  if (!match) {
    throw new Error(`MathJax provided an invalid SVG ${name}.`);
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "px";
  const pixels =
    unit === "ex"
      ? amount * EQUATION_EX_SIZE
      : unit === "em"
        ? amount * EQUATION_EM_SIZE
        : amount;
  const scaled = Math.ceil(pixels * EQUATION_SCALE);

  if (!Number.isFinite(scaled) || scaled < 1) {
    throw new Error(`MathJax provided an invalid SVG ${name}.`);
  }

  return scaled;
}

function assertNoExternalAssets(svg: SVGElement) {
  const elements = [svg, ...Array.from(svg.querySelectorAll("*"))];

  for (const element of elements) {
    const style = element.getAttribute("style");

    if (style?.includes("url(")) {
      throw new Error("Equation SVG contains an external style asset.");
    }

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const isAssetReference = name === "href" || name === "xlink:href" || name === "src";

      if (isAssetReference && attribute.value && !attribute.value.startsWith("#")) {
        throw new Error("Equation SVG contains an external asset reference.");
      }
    }
  }
}

function normalizeSvg(
  markup: string,
  color: string,
): Pick<EquationRenderResult, "svg" | "width" | "height"> {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");

  if (parsed.querySelector("parsererror")) {
    throw new Error("MathJax returned malformed SVG.");
  }

  const svg = parsed.documentElement;

  if (svg.localName !== "svg") {
    throw new Error("MathJax did not return an SVG image.");
  }

  if (svg.querySelector("foreignObject")) {
    throw new Error("Equation SVG contains unsupported embedded HTML.");
  }

  const svgElement = svg as unknown as SVGElement;

  assertNoExternalAssets(svgElement);

  const width = readDimension(svgElement.getAttribute("width"), "width");
  const height = readDimension(svgElement.getAttribute("height"), "height");

  svgElement.removeAttribute("style");
  svgElement.removeAttribute("width");
  svgElement.removeAttribute("height");
  svgElement.removeAttribute("xmlns:xlink");
  svgElement.setAttribute("xmlns", SVG_NAMESPACE);
  svgElement.setAttribute("width", `${width}px`);
  svgElement.setAttribute("height", `${height}px`);
  svgElement.setAttribute("role", "img");
  svgElement.setAttribute("focusable", "false");
  svgElement.setAttribute("color", color);

  return { svg: svgElement.outerHTML, width, height };
}

export function renderEquation(latex: string, color: string): EquationRenderResult {
  const trimmedLatex = latex.trim();
  const trimmedColor = color.trim();

  if (!trimmedLatex) {
    throw new Error("Enter an equation before inserting it.");
  }

  if (!trimmedColor) {
    throw new Error("Equation color is unavailable.");
  }

  const { adaptor, document } = getRenderer();
  const node = document.convert(trimmedLatex, {
    display: true,
    em: EQUATION_EM_SIZE,
    ex: EQUATION_EX_SIZE,
    containerWidth: 80 * EQUATION_EM_SIZE,
  });
  const normalized = normalizeSvg(adaptor.outerHTML(node), trimmedColor);

  return { latex: trimmedLatex, ...normalized };
}
