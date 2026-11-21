// ADR-0001 検証用: out/*.otf を macOS の CoreText で描画し、out5/render.png に並べる
import Foundation
import CoreText
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let names = ["E-flat-miter-w90", "E-round-round-w140", "E-slab-miter-w60"]
let text = "ANxO8g@"
let rowH = 200.0, W = 1500.0, H = rowH * Double(names.count)
let ctx = CGContext(data: nil, width: Int(W), height: Int(H), bitsPerComponent: 8, bytesPerRow: 0,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

for (i, n) in names.enumerated() {
  let url = URL(fileURLWithPath: "out5/\(n).otf") as CFURL
  guard let descs = CTFontManagerCreateFontDescriptorsFromURL(url) as? [CTFontDescriptor], let d = descs.first else {
    print("\(n): フォントを読めない"); continue
  }
  let font = CTFontCreateWithFontDescriptor(d, 120, nil)
  print("\(n): CoreText 名前=\(CTFontCopyFullName(font)) glyphs=\(CTFontGetGlyphCount(font))")
  let label = NSAttributedString(string: n, attributes: [kCTFontAttributeName as NSAttributedString.Key: CTFontCreateWithName("Helvetica" as CFString, 24, nil)])
  let s = NSAttributedString(string: text, attributes: [kCTFontAttributeName as NSAttributedString.Key: font])
  let y = H - rowH * Double(i + 1) + 50
  ctx.textPosition = CGPoint(x: 10, y: y + 60); CTLineDraw(CTLineCreateWithAttributedString(label), ctx)
  ctx.textPosition = CGPoint(x: 140, y: y); CTLineDraw(CTLineCreateWithAttributedString(s), ctx)
}
let img = ctx.makeImage()!
let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: "out5/render.png") as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil); CGImageDestinationFinalize(dest)
print("out5/render.png")
