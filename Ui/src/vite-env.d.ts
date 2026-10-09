/// <reference types="vite/client" />

//  自定义环境变量类型声明
interface ImportMetaEnv {
  /** 是否启用本地 Mock：'true' 时所有请求走本地适配层 */
  readonly VITE_USE_MOCK: string
  /** 后端 API 基址 */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
