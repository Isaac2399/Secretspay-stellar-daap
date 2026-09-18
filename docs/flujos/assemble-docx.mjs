import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const docxRoot = process.env.DOCX_PKG || process.cwd()
const require = createRequire(join(docxRoot, 'package.json'))
const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, PageBreak } = require('docx')

const root = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))

function pngSize(buf) {
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  }
}

const children = [
  new Paragraph({
    heading: HeadingLevel.TITLE,
    children: [new TextRun('SecretsPay — Feature flowcharts')],
  }),
  new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({
        text: 'Web2.5 wallet on Stellar Testnet. One flowchart per feature, ready to copy into Word. This is not mainnet and not a bank: balances are test funds.',
      }),
    ],
  }),
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun('Feature index')],
  }),
]

for (const item of manifest) {
  children.push(
    new Paragraph({
      children: [new TextRun({ text: item.title, bold: true })],
    }),
  )
}

children.push(new Paragraph({ children: [new PageBreak()] }))

const maxWidthPx = 620

for (const item of manifest) {
  const png = await readFile(item.png)
  const { width, height } = pngSize(png)
  const scale = Math.min(1, maxWidthPx / width)
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(item.title)],
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun(item.caption)],
    }),
    new Paragraph({
      spacing: { after: 400 },
      children: [
        new ImageRun({
          type: 'png',
          data: png,
          transformation: {
            width: Math.round(width * scale),
            height: Math.round(height * scale),
          },
        }),
      ],
    }),
  )
}

const doc = new Document({
  creator: 'SecretsPay',
  title: 'SecretsPay — Feature flowcharts',
  sections: [
    {
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children,
    },
  ],
})

const out = join(root, 'SecretsPay-feature-flowcharts.docx')
await writeFile(out, await Packer.toBuffer(doc))
console.log(`Wrote ${out}`)
