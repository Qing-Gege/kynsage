#!/usr/bin/env python3
"""从 DogHead.tsx 单一真源生成全套品牌图标。

真源只有一处:apps/renderer/src/features/sidebar/DogHead.tsx(赤陶身体 + 奶油细节)。
本脚本抽出其中的 <svg>,按 macOS Big Sur 图标网格合成底板,产出:

  build/icon.icns   mac app / dock
  build/icon.ico    Windows 任务栏 / 桌面快捷方式(16~256 多尺寸)
  build/icon.png    Linux AppImage(512)
  build/icon.svg    矢量母版(存档 / 文档用)
  apps/renderer/src/assets/logo-mark.svg  浏览器 favicon

默认**反色**(赤陶实底 + 奶油狗头):品牌区的狗头是奶油底立在深色 UI 里,
而 dock / 桌面 / 浏览器 tab 多半是浅色,奶油底会直接隐形 —— 图标必须反过来
才有存在感。加 --no-invert 可回到奶油底版本对比。

用法:  python3 scripts/gen-app-icon.py [--no-invert] [--preview]
依赖:  pip install cairosvg pillow  /  brew install imagemagick(magick)
"""
from __future__ import annotations

import argparse
import io
import re
import shutil
import subprocess
import sys
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TSX = ROOT / "apps/renderer/src/features/sidebar/DogHead.tsx"
BUILD = ROOT / "build"
FAVICON = ROOT / "apps/renderer/src/assets/logo-mark.svg"

TERRACOTTA = "#C2410C"  # 赤陶
CREAM = "#FBEDE5"  # 奶油

CANVAS = 1024  # 画布
PLATE = 824  # 圆角底板(Big Sur 网格)
RADIUS_RATIO = 0.2237  # 苹果圆角比例
DOG_RATIO = 0.76  # 狗头占底板比例
LIFT_RATIO = 0.012  # 视觉重心上移

# 小尺寸另做一版。眼睛/口鼻/眉毛在原图里是「底色露出的细缝」,缩到 48px 以下细缝
# 只剩不到一个像素,被抗锯齿抹成一片橙 —— 整块糊成橙团。
#
# 试过靠裁切放大换清晰度,是错的:16px 就是 16 个像素,放大换不回细节,还把垂耳
# 轮廓(真正的识别点)裁没了,变成一张认不出品类的贴脸特写。苹果/微软对 16/32
# 的做法是**减笔画**而不是放大:
#   ① 轮廓全留 —— 垂耳外形是「这是只狗」的唯一线索,一个像素都不能裁;
#   ② 去掉一像素细纹(眉毛、嘴角弧线、扇面高光),它们在小尺寸只会变成脏点;
#   ③ 眼睛/鼻子放粗成能占满整像素的实心块,细缝才不会被抹平。
SMALL_MAX = 48  # 用剪影版的最大边长
SMALL_RATIO = 0.80  # 剪影版占底板比例(剪影比线稿重,得比大图留更多边才透气)
# 16px 只有 16 个像素,连三个点都摆不进网格(试出来是眼鼻互相咬像素、糊成花)。
# 这一级再降一档:纯轮廓,一点不挖 —— 大厂 16px favicon 也是这么处理的。
TINY_MAX = 16
TINY_RATIO = 0.86  # 纯轮廓没有内部细节,可以给得更满


def extract_dog_svg(invert: bool) -> str:
    """抽出 DogHead 的 <svg>,JSX → 纯 XML;invert 时交换两个品牌色。"""
    src = TSX.read_text(encoding="utf-8")
    m = re.search(r"<svg[\s\n][\s\S]*?</svg>", src)
    if not m:
        sys.exit("在 DogHead.tsx 里没找到 <svg> —— 真源结构变了,先看看那个文件")
    svg = m.group(0)
    svg = re.sub(r"\{/\*[\s\S]*?\*/\}", "", svg)  # JSX 注释
    for junk in (r"\{children\}", r"\{\.\.\.props\}", r"ref=\{ref\}"):
        svg = re.sub(junk, "", svg)
    svg = svg.replace("className=", "class=")
    if "xmlns" not in svg.split(">", 1)[0]:
        svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    if invert:
        svg = svg.replace(TERRACOTTA, "@@").replace(CREAM, TERRACOTTA).replace("@@", CREAM)
    return svg


def simplify_for_small(svg: str, invert: bool, tiny: bool = False) -> str:
    """小尺寸另画一个「字形」:只留剪影 + 三个几何点。

    真源前三条路径是赤陶实心剪影(整头 / 左垂耳 / 右垂耳,含叼扇的小爪),
    反色后就是一整块奶油狗头轮廓 —— 垂耳外形是「这是只狗」的唯一线索,全留。
    其余 12 条细节路径(眉、眼、口鼻、内耳、扇面高光)在 16px 下全部只剩不到
    一个像素,一律不要;改在剪影上挖两只眼 + 一个鼻,尺寸按像素网格给足,
    小到 16px 时它们依然是三个咬满整像素的实心点。
    """
    paths = re.findall(r"<path[^>]*/>", svg)
    if len(paths) < 3:
        sys.exit("狗头真源不足 3 条剪影路径 —— 结构变了,simplify_for_small 需重写")
    head = svg.split(">", 1)[0] + ">"
    ink = TERRACOTTA if invert else CREAM  # 挖洞用的「反色」= 底板色

    # 坐标取自真源 viewBox(42 -3 758 758)里眼/鼻的实际位置。眼距拉开、点给足,
    # 16px 下三点之间才留得住一格底色 —— 挤在一起就又是一团。
    dots = (
        f'<ellipse cx="278" cy="318" rx="52" ry="60" fill="{ink}"/>'
        f'<ellipse cx="560" cy="318" rx="52" ry="60" fill="{ink}"/>'
        f'<ellipse cx="419" cy="462" rx="62" ry="46" fill="{ink}"/>'
    )
    if tiny:
        print("  16px:纯轮廓剪影(连眼鼻都不挖)")
        return head + "".join(paths[:3]) + "</svg>"
    print("  小尺寸:剪影字形(整头+双垂耳轮廓 + 眼鼻三点)")
    return head + "".join(paths[:3]) + dots + "</svg>"


def dog_bbox_in_viewbox(svg: str) -> tuple[float, float, float, float]:
    """渲染一次拿到狗头真实内容框,再换算回 viewBox 坐标(x, y, w, h)。"""
    vb = re.search(r'viewBox="([-\d.\s]+)"', svg)
    if not vb:
        sys.exit("狗头 SVG 缺 viewBox")
    vx, vy, vw, vh = (float(n) for n in vb.group(1).split())
    R = 2000
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=R, output_height=R)
    alpha = Image.open(io.BytesIO(png)).convert("RGBA").split()[3]
    box = alpha.getbbox()
    if not box:
        sys.exit("狗头渲染出来是空的")
    sx, sy = vw / R, vh / R
    return (vx + box[0] * sx, vy + box[1] * sy, (box[2] - box[0]) * sx, (box[3] - box[1]) * sy)


def compose_svg(dog_svg: str, invert: bool, small: bool = False, tiny: bool = False) -> str:
    """矢量合成:圆角底板 + 居中狗头。三档母版共用这一个函数。

    small=True 出剪影字形版(32/48);再叠 tiny=True 出 16px 的纯轮廓版。
    """
    if small:
        dog_svg = simplify_for_small(dog_svg, invert, tiny)
    x, y, w, h = dog_bbox_in_viewbox(dog_svg)
    bg = TERRACOTTA if invert else CREAM
    pad = (CANVAS - PLATE) / 2
    body = re.sub(r"^<svg[^>]*>", "", dog_svg.strip()).rsplit("</svg>", 1)[0].strip()
    body = body.replace(' class="dog-eye"', "")  # 静态图标不需要眯眼钩子

    if tiny:
        ratio, lift = TINY_RATIO, 0.0
    elif small:
        ratio, lift = SMALL_RATIO, 0.0
    else:
        ratio, lift = DOG_RATIO, LIFT_RATIO
    scale = min(PLATE * ratio / w, PLATE * ratio / h)
    cx, cy = x + w / 2, y + h / 2
    tx = CANVAS / 2 - cx * scale
    ty = CANVAS / 2 - cy * scale - PLATE * lift
    # 底板即裁切边界:简化版放大后溢出的部分(扇子)被切在板外
    clip = (
        f'  <clipPath id="plate"><rect x="{pad:g}" y="{pad:g}" width="{PLATE}" '
        f'height="{PLATE}" rx="{PLATE * RADIUS_RATIO:.1f}"/></clipPath>\n'
    )
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {CANVAS} {CANVAS}" '
        f'width="{CANVAS}" height="{CANVAS}">\n'
        f"  <!-- 由 scripts/gen-app-icon.py 从 DogHead.tsx 生成,勿手改 -->\n"
        f"{clip}"
        f'  <g clip-path="url(#plate)">\n'
        f'    <rect x="{pad:g}" y="{pad:g}" width="{PLATE}" height="{PLATE}" '
        f'rx="{PLATE * RADIUS_RATIO:.1f}" fill="{bg}"/>\n'
        f'    <g transform="translate({tx:.2f},{ty:.2f}) scale({scale:.5f})">\n'
        f"{body}\n    </g>\n  </g>\n</svg>\n"
    )


def rasterize(svg: str, invert: bool) -> Image.Image:
    """光栅母版。圆角用 PIL 重绘一遍蒙版,避免 cairo 边缘毛刺。"""
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=CANVAS, output_height=CANVAS)
    img = Image.open(io.BytesIO(png)).convert("RGBA")
    pad = (CANVAS - PLATE) // 2
    mask = Image.new("L", (CANVAS, CANVAS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [pad, pad, pad + PLATE - 1, pad + PLATE - 1],
        radius=int(PLATE * RADIUS_RATIO),
        fill=255,
    )
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def pick(size: int, master: Image.Image, small: Image.Image, tiny: Image.Image) -> Image.Image:
    """按目标边长选三档母版之一,再缩到位。"""
    src = tiny if size <= TINY_MAX else small if size <= SMALL_MAX else master
    return src.resize((size, size), Image.LANCZOS)


def export(master: Image.Image, small: Image.Image, tiny: Image.Image, tmp: Path) -> None:
    magick = shutil.which("magick") or shutil.which("convert")
    if not magick:
        sys.exit("缺 imagemagick:brew install imagemagick")

    iconset = tmp / "icon.iconset"
    iconset.mkdir(parents=True, exist_ok=True)
    for size, name in [
        (16, "icon_16x16"), (32, "icon_16x16@2x"), (32, "icon_32x32"),
        (64, "icon_32x32@2x"), (128, "icon_128x128"), (256, "icon_128x128@2x"),
        (256, "icon_256x256"), (512, "icon_256x256@2x"), (512, "icon_512x512"),
        (1024, "icon_512x512@2x"),
    ]:
        pick(size, master, small, tiny).save(iconset / f"{name}.png")
    subprocess.run(
        ["iconutil", "--convert", "icns", str(iconset), "--output", str(BUILD / "icon.icns")],
        check=True,
    )

    # ico 逐尺寸自己出图再打包(不用 auto-resize,否则 16/32 也走大母版会糊)
    layers = []
    for size in (256, 128, 64, 48, 32, 16):
        p = tmp / f"ico-{size}.png"
        pick(size, master, small, tiny).save(p)
        layers.append(str(p))
    subprocess.run([magick, *layers, str(BUILD / "icon.ico")], check=True)

    master.resize((512, 512), Image.LANCZOS).save(BUILD / "icon.png")


def preview(
    master: Image.Image, small: Image.Image, tiny: Image.Image, tmp: Path
) -> Path:
    """各尺寸并排铺在中性灰上 —— 小尺寸糊不糊,一眼看得出。"""
    sizes = [512, 256, 128, 64, 48, 32, 16]
    gap, pad = 28, 40
    w = pad * 2 + sum(sizes) + gap * (len(sizes) - 1)
    sheet = Image.new("RGB", (w, 512 + pad * 2), (232, 232, 232))
    x = pad
    for s in sizes:
        img = pick(s, master, small, tiny)
        sheet.paste(img, (x, pad + 512 - s), img)
        x += s + gap
    out = tmp / "icon-sizes.png"
    sheet.save(out)
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-invert", action="store_true", help="回到奶油底版本")
    ap.add_argument("--preview", action="store_true", help="额外输出尺寸对照图")
    args = ap.parse_args()
    invert = not args.no_invert

    tmp = ROOT / "tmp/icon"
    tmp.mkdir(parents=True, exist_ok=True)

    dog = extract_dog_svg(invert)
    svg = compose_svg(dog, invert)
    svg_small = compose_svg(dog, invert, small=True)
    svg_tiny = compose_svg(dog, invert, small=True, tiny=True)
    (BUILD / "icon.svg").write_text(svg, encoding="utf-8")
    # favicon 只在 16/32 出现 → 用剪影字形版,浏览器 tab 里才认得出是只狗
    FAVICON.write_text(svg_small, encoding="utf-8")

    master = rasterize(svg, invert)
    small = rasterize(svg_small, invert)
    tiny = rasterize(svg_tiny, invert)
    export(master, small, tiny, tmp)

    print(f"{'反色(赤陶底+奶油狗)' if invert else '正色(奶油底+赤陶狗)'} 已导出:")
    for p in ("icon.icns", "icon.ico", "icon.png", "icon.svg"):
        print(f"  build/{p}  {(BUILD / p).stat().st_size // 1024} KB")
    print(f"  {FAVICON.relative_to(ROOT)}  (≤{SMALL_MAX}px 简化版)")
    if args.preview:
        print(f"对照图: {preview(master, small, tiny, tmp)}")


if __name__ == "__main__":
    main()
