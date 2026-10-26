# Label Designer

A batch label tool for sizing, previewing, and exporting labels at true millimetre scale. Print a 1:1 PDF to test the sizes, or export SVG for a Snapmaker 2.0.

## Open it

After GitHub Pages is set to **GitHub Actions** in the repository settings, the site is [https://panglol.github.io/LabelDesigner_TVL/](https://panglol.github.io/LabelDesigner_TVL/). A push to `main` or `cursor/label-designer-f72c` rebuilds it.

To run a copy on this computer:

```bash
npm install
npm run dev
```

Open the local address Vite prints. `npm test` checks inheritance, packing, and SVG sizing. `npm run build` typechecks and builds the static app. A GitHub Pages build sets `VITE_BASE` to `/LabelDesigner_TVL/` so fonts and scripts load from that path.

The project saves in this browser. **File → Download project** writes a JSON file you can open later.

## How the sizes work

Every measurement is in millimetres.

- **Width** is set on each label.
- **Height**, **typeface**, and **font height** can follow a group. **Group** on a label means it uses the group value. **Own** keeps a value on that label alone.
- **Master height** at the top locks every group to one height. Labels set to Own stay at their own height.
- **Font height** is the em size. The caption under a group shows the cap height, which is the height of a capital letter.
- Select several rows to set width, height, font height, or typeface together. **Paste list** adds many labels at once:

```text
ON, 40
RESET, 60, 14
HELLO, WORLD, 70
```

Text comes first. Then width. Then an optional height, which is stored as that label’s own height. Commas or tabs both work.

Padding, alignment, tracking, corner radius, and line gap belong to the group, under **Inset, alignment, corners**.

## Preview

**Print sheet** packs the labels onto A4, US Letter, or a custom page, with dimension lines and a 100 mm calibration bar. The on-screen view is scaled to fit. The percentage is relative to a typical screen millimetre, not a promise about your display.

**Build plate** packs the same labels onto a Snapmaker 2.0 bed:

| Machine | Work area |
| --- | --- |
| A350 | 320 × 350 mm |
| A250 | 230 × 250 mm |
| A150 | 160 × 160 mm |

Red outlines are cut paths. Black lettering is meant to be engraved. Screen-only guides are left out of the export.

## PDF

**PDF 1:1** makes a PDF whose page size is the print sheet in millimetres. In the print dialog choose **Actual size** or **100%**. Do not choose Fit to page. The bar on the sheet is 100 mm when the page is wide enough, otherwise 50 mm. Measure it after printing.

## Snapmaker SVG

**Snapmaker SVG** exports one tight file per label, one file for the whole bed, or both.

- **Luban 72 DPI** matches a drag onto the Luban canvas. The file name ends with the millimetre size, such as `01-on-32x12mm.svg`. If Luban shows a different size, select the object and type the width and height from the file name. Some Luban versions treat **File → Import** differently from dragging the file onto the canvas, so check the size either way.
- **Millimetres** is the file to open in Inkscape, LightBurn, or Illustrator.

Lettering is converted to filled paths, so Luban does not need the font installed. Black is the lettering. A red outline is the cut. Map those colours to separate operations in Luban.

A plate file is the full bed. If Luban crops to the artwork bounds, set the object to the bed size in the file name, or import the individual label files.

Built-in faces are Latin subsets (Inter, IBM Plex Sans, IBM Plex Mono, Barlow Condensed, Space Grotesk, Source Serif 4), licensed under the SIL Open Font License in `public/fonts`. **Fonts → Add font file** accepts TTF, OTF, or WOFF, including a Traditional Chinese or brand face. Added fonts stay in this browser.
