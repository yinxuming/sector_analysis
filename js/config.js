/**
 * 前端配置
 */
const CONFIG = {
    // 数据文件路径
    dataPath: './data/',

    // 东方财富API代理配置
    // 直连 push2.eastmoney.com 在部分网络环境下会被拦截，通过代理中转解决
    // 代理格式: 代理地址/proxy?target=encodeURIComponent(原始URL)
    // 设为 null 则直连东方财富API
    apiProxy: 'https://1429314495-dxb6k8oy7q.ap-beijing.tencentscf.com',

    // 备用代理（主代理失败时自动切换）
    apiProxyBackup: 'https://vercel-proxy-p.vercel.app',

    // 数据刷新阈值（毫秒）：页面从不可见到可见时，超过此间隔自动刷新
    refreshThreshold: 5 * 60 * 1000,  // 5分钟

    // 默认配置
    defaults: {
        sectorType: 'concept',
        indicator: '今日',
        chartType: 'intraday',
        topN: 30
    },
    // 颜色配置
    colors: {
        inflow: '#f85149',       // 红色-净流入
        inflowLight: '#ff7b72',
        outflow: '#3fb950',      // 绿色-净流出
        outflowLight: '#7ee787',
        neutral: '#8b949e',
        background: '#0d1117',
        cardBg: '#161b22',
        border: '#30363d',
        text: '#e6edf3',
        textMuted: '#8b949e'
    },
    // ECharts主题色
    echartsTheme: {
        color: ['#f85149', '#3fb950', '#58a6ff', '#d29922', '#bc8cff',
                '#ff7b72', '#7ee787', '#79c0ff', '#e3b341', '#d2a8ff']
    }
};
