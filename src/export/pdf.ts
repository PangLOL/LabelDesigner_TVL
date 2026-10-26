import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";

export interface PdfPage {
  svg: string;
  width: number;
  height: number;
}

function orientation(width: number, height: number): "portrait" | "landscape" {
  return width > height ? "landscape" : "portrait";
}

export async function svgPagesToPdf(pages: PdfPage[], title: string): Promise<Blob> {
  if (pages.length === 0) throw new Error("Nothing to export");
  const first = pages[0];
  const doc = new jsPDF({
    unit: "mm",
    format: [first.width, first.height],
    orientation: orientation(first.width, first.height),
    compress: true,
  });
  doc.setProperties({
    title: `${title} 1:1`,
    subject: "Label sheet at true millimetre scale. Print at 100% / actual size.",
  });

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-12000px;top:0;width:0;height:0;overflow:hidden;";
  document.body.appendChild(host);
  try {
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      if (index > 0) doc.addPage([page.width, page.height], orientation(page.width, page.height));
      host.innerHTML = page.svg;
      const svg = host.querySelector("svg");
      if (!svg) throw new Error("Could not prepare a page");
      await svg2pdf(svg, doc, { x: 0, y: 0, width: page.width, height: page.height });
    }
  } finally {
    host.remove();
  }
  return doc.output("blob");
}
