/**
 * ECharts图表封装模块
 * 提供柱状图、热力图、桑基图、动态排行等图表
 */

const ChartRender = {

    /**
     * 渲染柱状图 - 板块资金净流入排名
     */
    renderBarChart(chartDom, data) {
        const chart = echarts.init(chartDom, 'dark');
        const sectors = data.sectors || [];
        const displaySectors = sectors;

        // 按净流入排序（从小到大，ECharts barh从下到上）
        displaySectors.sort((a, b) => a.main_net_inflow_yi - b.main_net_inflow_yi);

        const names = displaySectors.map(s => s.name);
        const values = displaySectors.map(s => s.main_net_inflow_yi);
        const changePcts = displaySectors.map(s => s.change_pct);

        const option = {
            backgroundColor: '#161b22',
            title: {
                text: `${data.sector_type || '行业板块'} - ${data.indicator || '今日'}资金净流向`,
                left: 'center',
                textStyle: { color: '#e6edf3', fontSize: 18 }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    const idx = params[0].dataIndex;
                    const s = displaySectors[idx];
                    return `<b>${s.name}</b><br/>` +
                           `主力净流入: <span style="color:${s.main_net_inflow_yi >= 0 ? '#f85149' : '#3fb950'}">${s.main_net_inflow_yi.toFixed(2)}亿</span><br/>` +
                           `涨跌幅: <span style="color:${s.change_pct >= 0 ? '#f85149' : '#3fb950'}">${s.change_pct.toFixed(2)}%</span><br/>` +
                           `主力净占比: ${s.main_net_inflow_pct.toFixed(2)}%`;
                }
            },
            grid: {
                left: '3%',
                right: '6%',
                bottom: '3%',
                top: '12%',
                containLabel: true
            },
            xAxis: {
                type: 'value',
                name: '主力资金净流入（亿元）',
                axisLine: { lineStyle: { color: '#30363d' } },
                axisLabel: { color: '#8b949e' },
                splitLine: { lineStyle: { color: '#21262d' } }
            },
            yAxis: {
                type: 'category',
                data: names,
                axisLine: { lineStyle: { color: '#30363d' } },
                axisLabel: {
                    color: '#e6edf3',
                    fontSize: 12,
                    width: 80,
                    overflow: 'truncate'
                }
            },
            series: [{
                type: 'bar',
                data: values.map((v, i) => ({
                    value: v,
                    itemStyle: {
                        color: v >= 0
                            ? new echarts.graphic.LinearGradient(0, 0, 1, 0, [
                                { offset: 0, color: '#f8514966' },
                                { offset: 1, color: '#f85149' }
                            ])
                            : new echarts.graphic.LinearGradient(1, 0, 0, 0, [
                                { offset: 0, color: '#3fb95066' },
                                { offset: 1, color: '#3fb950' }
                            ])
                    },
                    label: {
                        show: true,
                        position: v >= 0 ? 'right' : 'left',
                        formatter: `${v.toFixed(2)}亿`,
                        color: '#e6edf3',
                        fontSize: 11
                    }
                })),
                barWidth: '60%'
            }],
            visualMap: {
                show: false,
                pieces: [
                    { gte: 0, color: '#f85149' },
                    { lt: 0, color: '#3fb950' }
                ]
            }
        };

        chart.setOption(option);
        window.addEventListener('resize', () => chart.resize());
        return chart;
    },

    /**
     * 渲染热力图 - 板块资金流向方块热力图
     */
    renderHeatmap(chartDom, data) {
        const chart = echarts.init(chartDom, 'dark');
        const sectors = data.sectors || [];
        const displaySectors = sectors;

        // 按净流入绝对值排序
        displaySectors.sort((a, b) => Math.abs(b.main_net_inflow_yi) - Math.abs(a.main_net_inflow_yi));

        const cols = 5;
        const rows = Math.ceil(displaySectors.length / cols);

        // 构建treemap数据
        const treeData = displaySectors.map(s => ({
            name: s.name,
            value: Math.abs(s.main_net_inflow_yi),
            netInflow: s.main_net_inflow_yi,
            changePct: s.change_pct,
            itemStyle: {
                color: s.main_net_inflow_yi >= 0 ? '#f85149' : '#3fb950',
                borderColor: '#0d1117',
                borderWidth: 2
            }
        }));

        const option = {
            backgroundColor: '#161b22',
            title: {
                text: `${data.sector_type || '行业板块'} - ${data.indicator || '今日'}资金流向热力图`,
                left: 'center',
                textStyle: { color: '#e6edf3', fontSize: 18 }
            },
            tooltip: {
                formatter: function(info) {
                    const d = info.data;
                    if (!d) return '';
                    return `<b>${d.name}</b><br/>` +
                           `主力净流入: <span style="color:${d.netInflow >= 0 ? '#f85149' : '#3fb950'}">${d.netInflow.toFixed(2)}亿</span><br/>` +
                           `涨跌幅: <span style="color:${d.changePct >= 0 ? '#f85149' : '#3fb950'}">${d.changePct.toFixed(2)}%</span>`;
                }
            },
            series: [{
                type: 'treemap',
                data: treeData,
                width: '95%',
                height: '85%',
                top: '10%',
                roam: false,
                nodeClick: false,
                breadcrumb: { show: false },
                label: {
                    show: true,
                    formatter: function(params) {
                        const d = params.data;
                        return `${d.name}\n${d.netInflow.toFixed(1)}亿`;
                    },
                    fontSize: 12,
                    color: '#fff'
                },
                itemStyle: {
                    borderColor: '#0d1117',
                    borderWidth: 3,
                    gapWidth: 3
                },
                levels: [{
                    itemStyle: {
                        borderColor: '#0d1117',
                        borderWidth: 3,
                        gapWidth: 3
                    }
                }]
            }]
        };

        chart.setOption(option);
        window.addEventListener('resize', () => chart.resize());
        return chart;
    },

    /**
     * 渲染桑基图 - 资金流向关系
     */
    renderSankey(chartDom, data) {
        const chart = echarts.init(chartDom, 'dark');
        const sectors = data.sectors || [];
        const topN = parseInt(document.getElementById('topN').value) || 20;
        const displaySectors = topN > 0 ? sectors.slice(0, topN) : sectors;

        // 分离流入和流出板块
        const inflowSectors = displaySectors.filter(s => s.main_net_inflow_yi > 0);
        const outflowSectors = displaySectors.filter(s => s.main_net_inflow_yi < 0);

        // 构建桑基图节点
        const nodes = [];
        nodes.push({ name: '市场资金', itemStyle: { color: '#58a6ff' } });

        inflowSectors.forEach(s => {
            nodes.push({
                name: s.name,
                itemStyle: { color: '#f85149' }
            });
        });

        outflowSectors.forEach(s => {
            nodes.push({
                name: s.name,
                itemStyle: { color: '#3fb950' }
            });
        });

        // 构建桑基图链接
        const links = [];
        // 流入板块：市场 -> 板块
        inflowSectors.forEach(s => {
            links.push({
                source: '市场资金',
                target: s.name,
                value: Math.abs(s.main_net_inflow_yi)
            });
        });
        // 流出板块：板块 -> 市场
        outflowSectors.forEach(s => {
            links.push({
                source: s.name,
                target: '市场资金',
                value: Math.abs(s.main_net_inflow_yi)
            });
        });

        const option = {
            backgroundColor: '#161b22',
            title: {
                text: `${data.sector_type || '行业板块'} - ${data.indicator || '今日'}资金流向桑基图`,
                left: 'center',
                textStyle: { color: '#e6edf3', fontSize: 18 }
            },
            tooltip: {
                trigger: 'item',
                triggerOn: 'mousemove',
                formatter: function(params) {
                    if (params.dataType === 'edge') {
                        return `${params.data.source} → ${params.data.target}<br/>金额: ${params.data.value.toFixed(2)}亿`;
                    }
                    return params.name;
                }
            },
            series: [{
                type: 'sankey',
                data: nodes,
                links: links,
                emphasis: {
                    focus: 'adjacency'
                },
                lineStyle: {
                    color: 'gradient',
                    curveness: 0.5,
                    opacity: 0.4
                },
                label: {
                    color: '#e6edf3',
                    fontSize: 12
                },
                left: '5%',
                right: '5%',
                top: '10%',
                bottom: '5%'
            }]
        };

        chart.setOption(option);
        window.addEventListener('resize', () => chart.resize());
        return chart;
    },

    /**
     * 渲染动态排行图 (Bar Race)
     */
    renderBarRace(chartDom, data) {
        const chart = echarts.init(chartDom, 'dark');
        const dates = data.dates || [];
        const dailyData = data.daily_data || {};

        if (dates.length === 0) {
            chart.showLoading({ text: '暂无历史数据，需积累多日快照后展示' });
            return chart;
        }

        // 获取所有板块名称
        const allNames = new Set();
        Object.values(dailyData).forEach(sectors => {
            sectors.forEach(s => allNames.add(s.name));
        });
        const nameList = Array.from(allNames);

        let currentIndex = 0;

        function getOption(index) {
            const date = dates[index];
            const sectors = dailyData[date] || [];
            sectors.sort((a, b) => a.value - b.value);

            const names = sectors.map(s => s.name);
            const values = sectors.map(s => s.value);

            return {
                backgroundColor: '#161b22',
                title: {
                    text: `${data.sector_type || '行业板块'} - 资金流向动态排行`,
                    subtext: date,
                    left: 'center',
                    textStyle: { color: '#e6edf3', fontSize: 18 },
                    subtextStyle: { color: '#8b949e', fontSize: 14 }
                },
                grid: {
                    left: '3%',
                    right: '8%',
                    bottom: '3%',
                    top: '12%',
                    containLabel: true
                },
                xAxis: {
                    type: 'value',
                    name: '主力资金净流入（亿元）',
                    axisLine: { lineStyle: { color: '#30363d' } },
                    axisLabel: { color: '#8b949e' },
                    splitLine: { lineStyle: { color: '#21262d' } }
                },
                yAxis: {
                    type: 'category',
                    data: names,
                    axisLine: { lineStyle: { color: '#30363d' } },
                    axisLabel: { color: '#e6edf3', fontSize: 12 }
                },
                series: [{
                    type: 'bar',
                    data: values.map(v => ({
                        value: v,
                        itemStyle: {
                            color: v >= 0 ? '#f85149' : '#3fb950'
                        },
                        label: {
                            show: true,
                            position: v >= 0 ? 'right' : 'left',
                            formatter: `${v.toFixed(2)}亿`,
                            color: '#e6edf3',
                            fontSize: 11
                        }
                    })),
                    barWidth: '60%'
                }],
                animationDurationUpdate: 800,
                animationEasingUpdate: 'cubicInOut'
            };
        }

        chart.setOption(getOption(currentIndex));

        // 自动播放
        let timer = null;
        function startPlay() {
            if (timer) clearInterval(timer);
            timer = setInterval(() => {
                currentIndex = (currentIndex + 1) % dates.length;
                chart.setOption(getOption(currentIndex));
            }, 2000);
        }

        function stopPlay() {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        }

        startPlay();

        // 点击暂停/播放
        chartDom.addEventListener('click', () => {
            if (timer) {
                stopPlay();
            } else {
                startPlay();
            }
        });

        window.addEventListener('resize', () => chart.resize());
        return chart
    },

    /**
     * 渲染分时折线图 - 板块资金流向分时曲线
     * 每个板块一条折线，X轴为交易时间，Y轴为累计净流入金额
     * 参考雪球研习社/同花顺风格
     */
    renderIntradayChart(chartDom, data) {
        const chart = echarts.init(chartDom, 'dark');
        const times = data.times || [];
        const sectors = data.sectors || [];
        const displaySectors = sectors;

        if (times.length === 0 || displaySectors.length === 0) {
            chart.showLoading({ text: '暂无分时数据\n需在交易时段运行定时采集积累数据' });
            return chart;
        }

        // 颜色池（红涨绿跌渐变色系）
        const colorPool = [
            '#f85149', '#ff7b72', '#ff9a8b', '#ffa198', '#ffb4aa',
            '#3fb950', '#56d364', '#7ee787', '#a5d6a7',
            '#58a6ff', '#79c0ff', '#a5d6ff',
            '#d2a8ff', '#bc8cff', '#e6b3ff',
            '#f0883e', '#f7ba61', '#ffd700',
            '#a371f7', '#8957e5', '#da3633'
        ];

        // 构建系列：每个板块一条折线
        const series = displaySectors.map((sector, index) => {
            const isPositive = sector.final_value >= 0;
            // 流入用红色系，流出用绿色系
            let color;
            if (isPositive) {
                color = colorPool[index % 6];  // 红色系
            } else {
                color = colorPool[6 + (index % 5)];  // 绿色系
            }

            return {
                name: sector.name,
                type: 'line',
                data: sector.data,
                smooth: false,
                symbol: 'none',          // 不显示数据点标记
                lineStyle: { width: 1.5, color: color },
                itemStyle: { color: color },
                // 末端标签显示板块名称和最终值
                markPoint: {
                    symbol: 'circle',
                    symbolSize: 4,
                    itemStyle: { color: color },
                    label: {
                        show: true,
                        position: 'right',
                        formatter: function(params) {
                            return `${sector.name} ${sector.final_value > 0 ? '+' : ''}${sector.final_value.toFixed(2)}`;
                        },
                        fontSize: 11,
                        color: isPositive ? '#f85149' : '#3fb950',
                        fontWeight: 'bold'
                    },
                    data: [{ coord: [times.length - 1, sector.final_value] }]
                }
            };
        });

        // 计算Y轴范围（留出标签空间）
        let maxVal = -Infinity;
        let minVal = Infinity;
        displaySectors.forEach(s => {
            s.data.forEach(v => {
                if (v > maxVal) maxVal = v;
                if (v < minVal) minVal = v;
            });
        });
        const padding = Math.max(Math.abs(maxVal - minVal) * 0.15, 10);

        const option = {
            backgroundColor: '#161b22',
            title: {
                text: `${data.date || ''} 分时资金流向`,
                subtext: `${data.sector_type || ''}`,
                left: 'center',
                textStyle: { color: '#e6edf3', fontSize: 18 },
                subtextStyle: { color: '#8b949e', fontSize: 13 }
            },
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'cross' },
                formatter: function(params) {
                    if (!params || params.length === 0) return '';
                    let html = `<b>${params[0].axisValue}</b><br/>`;
                    params.sort((a, b) => b.value - a.value);
                    params.slice(0, 10).forEach(p => {
                        const val = p.value !== undefined && p.value !== null ? p.value.toFixed(2) : '-';
                        const color = p.value >= 0 ? '#f85149' : '#3fb950';
                        html += `<span style="color:${p.color}">${p.seriesName}</span>: ` +
                                `<span style="color:${color}">${val}亿</span><br/>`;
                    });
                    if (params.length > 10) {
                        html += `<span style="color:#8b949e">...等${params.length}个板块</span>`;
                    }
                    return html;
                }
            },
            legend: {
                show: false  // 板块多时不显示图例，用末端标签代替
            },
            grid: {
                left: '8%',
                right: '18%',   // 右侧留空间给末端标签
                bottom: '5%',
                top: '12%',
                containLabel: false
            },
            xAxis: {
                type: 'category',
                data: times,
                boundaryGap: false,
                axisLine: { lineStyle: { color: '#30363d' } },
                axisLabel: { color: '#8b949e', fontSize: 11 },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'value',
                name: '主力资金净流入（亿元）',
                nameTextStyle: { color: '#8b949e', fontSize: 12 },
                axisLine: { lineStyle: { color: '#30363d' } },
                axisLabel: {
                    color: '#8b949e',
                    formatter: v => v + '亿'
                },
                splitLine: { lineStyle: { color: '#21262d', type: 'dashed' } },
                // 零线加粗高亮
                axisTick: { show: false },
                min: Math.floor(minVal - padding),
                max: Math.ceil(maxVal + padding)
            },
            // 零线参考线
            markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: '#8b949e', width: 1, type: 'solid' },
                data: [{ yAxis: 0 }]
            },
            series: series,
            animationDuration: 1000,
            animationEasing: 'cubicOut'
        };

        chart.setOption(option);
        window.addEventListener('resize', () => chart.resize());
        return chart;
    }
};
