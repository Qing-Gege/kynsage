# 内置字体

随应用打包的等宽字体，经 `fonts.css` 的 `@font-face` 注册、`main.tsx` 导入。
转换流程：官方 release TTF → woff2（wawoff2 无损压缩）。Regular + Bold（LXGW 仅 Regular）。

## Maple Mono NL CN

- 变体：No-Ligature（无连字）+ CN（中文）
- 字重：Regular (400)、Bold (700)
- 来源：https://github.com/subframe7536/maple-font （release v7.9，`MapleMonoNL-CN.zip`）
- 许可：SIL Open Font License 1.1，见 `MapleMono-OFL.txt`
- font-family：`Maple Mono NL CN`

## LXGW Bright Code GB

- 字重：Regular (400)（该字族无 Bold 切，粗体由系统合成）
- 来源：https://github.com/lxgw/LxgwBright-Code （release v2.922，`LxgwBrightCodeGB.7z`）
- 许可：SIL Open Font License 1.1（基于 Klee / LXGW WenKai / Monaspace）
- font-family：`LXGW Bright Code GB`

## 重新生成 woff2

```bash
# 从官方 release 下载并解出 Regular/Bold 的 .ttf 后：
npx wawoff2 # 或用 node 调 require('wawoff2').compress(ttfBuffer)
```

font-family 名必须与字体内部 name 表（nameID 1）完全一致，否则设置面板下拉的 value 匹配不上、回退系统字体。
