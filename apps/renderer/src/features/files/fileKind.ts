// 扩展名 → 中文类型名。展开态多列视图的「类型」列用。
//
// 为什么自己维护一张表而不读系统：资源管理器的类型名来自注册表，随机器上装了
// 什么软件而变（同一个 .md 在两台机器上可能显示「MD 文件」或「Typora 文档」）。
// 这里给稳定、说人话的中文名 —— 用户是律师和作家，"Markdown 文档"比"MD 文件"有用。

const KIND: Record<string, string> = {
  // 文档
  md: 'Markdown 文档', markdown: 'Markdown 文档',
  txt: '文本文档', rtf: '写字板文档',
  doc: 'Word 文档', docx: 'Word 文档',
  xls: 'Excel 表格', xlsx: 'Excel 表格', csv: 'CSV 表格',
  ppt: 'PowerPoint 演示', pptx: 'PowerPoint 演示',
  pdf: 'PDF 文档',
  // 图像
  png: 'PNG 图像', jpg: 'JPEG 图像', jpeg: 'JPEG 图像', gif: 'GIF 图像',
  webp: 'WebP 图像', svg: 'SVG 图像', bmp: 'BMP 图像', ico: '图标',
  heic: 'HEIC 图像', avif: 'AVIF 图像',
  // 音视频
  mp3: '音频', wav: '音频', flac: '音频', m4a: '音频', aac: '音频',
  mp4: '视频', mov: '视频', avi: '视频', mkv: '视频', webm: '视频',
  // 压缩
  zip: '压缩文件', rar: '压缩文件', '7z': '压缩文件',
  gz: '压缩文件', tar: '压缩文件', bz2: '压缩文件',
  // 代码与配置
  js: 'JavaScript 文件', mjs: 'JavaScript 文件', cjs: 'JavaScript 文件',
  ts: 'TypeScript 文件', tsx: 'TypeScript 文件', jsx: 'JavaScript 文件',
  py: 'Python 文件', rb: 'Ruby 文件', go: 'Go 文件', rs: 'Rust 文件',
  java: 'Java 文件', c: 'C 文件', h: 'C 头文件', cpp: 'C++ 文件',
  cs: 'C# 文件', php: 'PHP 文件', swift: 'Swift 文件', kt: 'Kotlin 文件',
  sh: 'Shell 脚本', bat: '批处理文件', ps1: 'PowerShell 脚本',
  html: 'HTML 文档', htm: 'HTML 文档', css: '样式表', scss: '样式表',
  json: 'JSON 文件', yaml: 'YAML 文件', yml: 'YAML 文件',
  xml: 'XML 文件', toml: 'TOML 文件', ini: '配置文件', env: '环境变量文件',
  sql: 'SQL 文件',
  // 可执行与安装包
  exe: '应用程序', msi: '安装程序', dmg: '磁盘映像', app: '应用程序',
  deb: '安装包', rpm: '安装包', apk: '安装包',
  // 字体
  ttf: '字体文件', otf: '字体文件', woff: '字体文件', woff2: '字体文件',
};

/** 文件/文件夹的中文类型名。文件夹恒为「文件夹」，无扩展名回退「文件」。 */
export function fileKind(name: string, isDirectory: boolean): string {
  if (isDirectory) return '文件夹';
  const dot = name.lastIndexOf('.');
  // 首字符是点（.gitignore）不算扩展名，那是隐藏文件的整名
  if (dot <= 0) return '文件';
  const ext = name.slice(dot + 1).toLowerCase();
  return KIND[ext] ?? `${ext.toUpperCase()} 文件`;
}
