/**
 * 前端配置
 */
const CONFIG = {
    // 数据文件路径
    dataPath: './data/',
    // 默认配置
    defaults: {
        sectorType: 'industry',
        indicator: '今日',
        chartType: 'bar',
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
