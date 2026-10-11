//  商品页面共用工具：商品图渲染 + 地区筛选选项

/** 地区筛选选项（与 Mock 种子地区池一致） */
export const 地区选项 = ['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '苏州', '重庆'].map(
  (名称) => ({ label: 名称, value: 名称 }),
)

/** 商品图渲染（原生 img 最可靠；真实爬取可能缺图，空值时显示占位块） */
export const 商品图 = (值: string, 尺寸: number, 置灰?: boolean) =>
  值 ? (
    <img
      src={值}
      width={尺寸}
      height={尺寸}
      alt="商品图"
      style={{
        objectFit: 'cover',
        borderRadius: 6,
        display: 'block',
        filter: 置灰 ? 'grayscale(0.8)' : undefined,
      }}
    />
  ) : (
    <div
      style={{
        width: 尺寸,
        height: 尺寸,
        borderRadius: 6,
        background: '#fff2e8',
        color: '#fa8c16',
        fontSize: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      暂无图
    </div>
  )
