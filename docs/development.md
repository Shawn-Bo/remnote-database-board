# 开发与部署

## 本地构建

使用 Node.js 22 或更新版本：

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run serve
```

构建产物为 `dist/` 和 `PluginZip.zip`。在 RemNote 的 **设置 → 插件 → 构建 → 从 localhost 开发** 中填入 `http://localhost:8081`，即可加载本机版本。

发布时通过 **设置 → 插件 → 构建 → 上传插件** 提交 `PluginZip.zip`，按页面提示补充源码包。插件说明取自根目录的 `README.md`。

## 交互验证

隔离预览使用合成数据，运行在另一个端口：

```sh
BOARD_PORT=8083 npm run serve
```

访问 `http://localhost:8083/preview.html`。`test:browser`、`test:mobile` 和 `test:touch` 对此预览进行交互检查。原生编辑器、设备安装和跨设备同步在 RemNote 客户端中验收，记录见 [验证记录](notion-database-experience.md)。

## 数据与编辑

- **数据源**：沿用高级表格的原标签、属性和记录。从表格进入时保留其行范围；**视图设置 → 数据源 → 显示数据库全部记录** 可扩展到标签下全部记录。数据源和行范围由各视图共用。
- **视图配置**：布局、显示属性、列宽、筛选、排序、分组和卡片顺序按视图保存，使用 RemNote 的同步插件存储。
- **属性编辑**：表格可直接编辑单选、纯文本、数字和 URL。富文本、多选和日期等内容通过原生笔记编辑。写入前检查记录、属性、选项及旧值，写入后回读核对。
- **新建记录**：在数据库标签下创建 Rem，按支持的等值筛选与看板分组预填属性，随后打开其原生页面。部分创建失败时返回已创建的 Rem ID，方便继续处理。
- **原生内容**：侧栏通过 SDK 的 `DocumentViewer` 呈现完整笔记，保存和同步沿用 RemNote。图片使用原生 RichText 渲染；为提取文本而清理的图片参数仅作用于临时副本。
- **权限与连接**：使用公开 SDK 和 `All / ReadCreateModify` 权限。笔记内容由 RemNote 处理；本地服务在 `127.0.0.1:8081` 提供静态插件文件。

并发写入采用旧值检查和回读校验；SDK 多步写入的原子性及服务器同步由宿主能力决定。

## 兼容与后续工作

| 项目 | 当前实现或进展 |
| --- | --- |
| 插件窗口 | 接近整窗的弹窗；RemNote 1.28.62 的 pane parser 对 SDK `widget~` 前缀报错，因此采用此入口 |
| 桌面笔记侧栏 | 数据库与完整原生页面并排操作 |
| 窄屏布局 | 原生页面全宽；控件触摸区域至少 44px；手机尺寸预览已验证 |
| iPhone | 实机安装、触摸与跨设备同步待验收 |
| 后续布局 | 日历、时间线、表格分组 |
| 后续配置 | 嵌套筛选组、更多属性类型的直接编辑、数据结构设计器 |
| SDK 依赖 | Zod 受 GHSA-mrhx-c7xc-m3w5 影响：超大无效数组可能耗尽内存；跟进上游兼容修复 |

## 电脑部署包

部署包内含构建好的插件文件与启动脚本。Mac 运行 `Install-Mac.command`，Windows 运行 `Start-Windows.cmd`，再通过 RemNote 的 localhost 开发入口加载。

Mac 安装器会停止旧服务、启动并校验新版，成功后清理本插件生成的旧运行目录；失败时恢复旧服务。健康状态位于 `http://localhost:8081/__board_health`。
