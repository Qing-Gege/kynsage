// 一次性 localStorage 键迁移:marshal.* → kynsage.*(品牌统一去 marshal)。
// 必须在任何 store 模块加载「之前」执行 —— store 在模块顶层即读 localStorage,
// 故本模块要在 main.tsx 里第一个 import(先于 ./App 及其 store 依赖链)。
// 幂等:新键已存在则跳过;搬完删旧键。老用户(装过旧版)设置/收藏/主题不丢。

const KEY_MAP: Record<string, string> = {
  'marshal.settings': 'kynsage.settings',
  'marshal.favorites': 'kynsage.favorites',
  'marshal.theme': 'kynsage.theme',
  'marshal.layout.mode': 'kynsage.layout.mode',
  'marshal.layout.sidebarCollapsed': 'kynsage.layout.sidebarCollapsed',
  'marshal.layout.sidebarW': 'kynsage.layout.sidebarW',
  'marshal.layout.filesW': 'kynsage.layout.filesW',
};

// 已废弃的键:collapsedFilesW 曾未 clamp 地覆盖 --files-w，旧版(文件区为弹性宽列时)
// 记录的大值会让文件区一直很宽。彻底清除新旧两处残留,让文件区只由 filesW 决定。
const DEAD_KEYS = ['kynsage.layout.collapsedFilesW', 'marshal.layout.collapsedFilesW'];

try {
  for (const [oldKey, newKey] of Object.entries(KEY_MAP)) {
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, oldVal);
    }
    if (oldVal !== null) localStorage.removeItem(oldKey);
  }
  for (const key of DEAD_KEYS) localStorage.removeItem(key);
} catch {
  /* localStorage 不可用时静默:store 各自有默认兜底 */
}
