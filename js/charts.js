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

        // 为每个板块构建独立的rich样式（实现动态颜色）
        const richStyles = { name: { color: '#e6edf3', fontSize: 12 } };
        const names = displaySectors.map((s, i) => {
            const pct = s.change_pct || 0;
            const pctStr = pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
            const pctColor = pct >= 0 ? '#f85149' : '#3fb950';
            // 每个板块使用独立的rich样式key，避免内联style
            const pctKey = `pct_${i}`;
            richStyles[pctKey] = { color: pctColor, fontSize: 12, fontWeight: 'bold' };
            return `{name|${s.name}}{${pctKey}|(${pctStr})}`;
        });
        const values = displaySectors.map(s => s.main_net_inflow_yi);
        const changePcts = displaySectors.map(s => s.change_pct || 0);
        const turnoverYis = displaySectors.map(s => s.turnover_yi || 0);

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
                    const pctColor = s.change_pct >= 0 ? '#f85149' : '#3fb950';
                    const turnover = s.turnover_yi || 0;
                    return `<b>${s.name}</b><br/>` +
                           `主力净流入: <span style="color:${s.main_net_inflow_yi >= 0 ? '#f85149' : '#3fb950'}">${s.main_net_inflow_yi.toFixed(2)}亿</span><br/>` +
                           `涨跌幅: <span style="color:${pctColor}">${s.change_pct >= 0 ? '+' : ''}${s.change_pct.toFixed(2)}%</span><br/>` +
                           `成交额: <span style="color:#58a6ff">${turnover.toFixed(1)}亿</span><br/>` +
                           `主力净占比: ${(s.main_net_inflow_pct || 0).toFixed(2)}%`;
                }
            },
            grid: {
                left: '2%',
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
                    width: 200,
                    overflow: 'none',
                    rich: richStyles
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
            changePct: s.change_pct || 0,
            turnoverYi: s.turnover_yi || 0,
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
                    const pctColor = d.changePct >= 0 ? '#f85149' : '#3fb950';
                    return `<b>${d.name}</b><br/>` +
                           `主力净流入: <span style="color:${d.netInflow >= 0 ? '#f85149' : '#3fb950'}">${d.netInflow.toFixed(2)}亿</span><br/>` +
                           `涨跌幅: <span style="color:${pctColor}">${d.changePct >= 0 ? '+' : ''}${d.changePct.toFixed(2)}%</span><br/>` +
                           `成交额: <span style="color:#58a6ff">${d.turnoverYi.toFixed(1)}亿</span>`;
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
                        const pct = d.changePct >= 0 ? `+${d.changePct.toFixed(2)}%` : `${d.changePct.toFixed(2)}%`;
                        return `${d.name}(${pct})\n${d.netInflow.toFixed(1)}亿`;
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

        // 构建桑基图节点（标签格式：板块名(涨幅)）
        const nodes = [];
        nodes.push({ name: '市场资金', itemStyle: { color: '#58a6ff' } });

        inflowSectors.forEach(s => {
            const pct = (s.change_pct || 0) >= 0 ? `+${(s.change_pct || 0).toFixed(2)}%` : `${(s.change_pct || 0).toFixed(2)}%`;
            nodes.push({
                name: `${s.name}(${pct})`,
                itemStyle: { color: '#f85149' }
            });
        });

        outflowSectors.forEach(s => {
            const pct = (s.change_pct || 0) >= 0 ? `+${(s.change_pct || 0).toFixed(2)}%` : `${(s.change_pct || 0).toFixed(2)}%`;
            nodes.push({
                name: `${s.name}(${pct})`,
                itemStyle: { color: '#3fb950' }
            });
        });

        // 构建桑基图链接
        const links = [];
        // 流入板块：市场 -> 板块
        inflowSectors.forEach(s => {
            const pct = (s.change_pct || 0) >= 0 ? `+${(s.change_pct || 0).toFixed(2)}%` : `${(s.change_pct || 0).toFixed(2)}%`;
            links.push({
                source: '市场资金',
                target: `${s.name}(${pct})`,
                value: Math.abs(s.main_net_inflow_yi)
            });
        });
        // 流出板块：板块 -> 市场
        outflowSectors.forEach(s => {
            const pct = (s.change_pct || 0) >= 0 ? `+${(s.change_pct || 0).toFixed(2)}%` : `${(s.change_pct || 0).toFixed(2)}%`;
            links.push({
                source: `${s.name}(${pct})`,
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
     * 右侧末端标签显示板块名称(涨幅)+净流入，防重叠依次展开
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

        // 丰富颜色池：每个板块用不同颜色区分
        const colorPool = [
            '#f85149', '#ff7b72', '#ffa198',       // 红色系
            '#3fb950', '#56d364', '#7ee787',       // 绿色系
            '#58a6ff', '#79c0ff', '#a5d6ff',       // 蓝色系
            '#d2a8ff', '#bc8cff', '#e6b3ff',       // 紫色系
            '#f0883e', '#f7ba61', '#ffd700',       // 橙黄系
            '#a371f7', '#8957e5', '#da3633',       // 深色系
            '#39d353', '#26a641', '#1f6feb',       // 补充色
            '#f778ba', '#ff9bce', '#db61a2'        // 粉色系
        ];

        // 计算Y轴范围（留出标签空间）
        let maxVal = -Infinity;
        let minVal = Infinity;
        displaySectors.forEach(s => {
            s.data.forEach(v => {
                if (v !== null && v > maxVal) maxVal = v;
                if (v !== null && v < minVal) minVal = v;
            });
        });
        const padding = Math.max(Math.abs(maxVal - minVal) * 0.15, 10);
        const yMin = Math.floor(minVal - padding);
        const yMax = Math.ceil(maxVal + padding);

        // 计算标签防重叠偏移量 - 从中间向上下两侧发散
        const labelHeight = 16; // 每个标签占用的像素高度
        const labelOffsets = new Array(displaySectors.length).fill(0);
        const sortedWithIndex = displaySectors
            .map((s, i) => ({ final_value: s.final_value, index: i }))
            .sort((a, b) => a.final_value - b.final_value);

        // 将Y值转换为像素位置
        const chartHeight = parseInt(chartDom.style.height) || 600;
        const gridTop = chartHeight * 0.12;
        const gridBottom = chartHeight * 0.05;
        const plotHeight = chartHeight - gridTop - gridBottom;
        const yRange = yMax - yMin || 1;

        // 计算每个标签的原始像素Y坐标
        const pixelPositions = sortedWithIndex.map(item =>
            gridTop + plotHeight * (1 - (item.final_value - yMin) / yRange)
        );

        // 从中间向两侧发散：中间标签不偏移，上方标签向上偏，下方标签向下偏
        const n = sortedWithIndex.length;
        const midIdx = Math.floor(n / 2);

        // 中间标签不偏移
        for (let i = midIdx; i < n; i++) {
            // 下半部分（Y值较大，像素位置靠上）：向下偏移
            for (let j = midIdx; j < i; j++) {
                const curY = pixelPositions[i] + labelOffsets[sortedWithIndex[i].index];
                const prevY = pixelPositions[j] + labelOffsets[sortedWithIndex[j].index];
                if (curY < prevY && prevY - curY < labelHeight) {
                    labelOffsets[sortedWithIndex[i].index] += (prevY - labelHeight) - curY;
                }
            }
        }

        for (let i = midIdx - 1; i >= 0; i--) {
            // 上半部分（Y值较小，像素位置靠下）：向上偏移
            for (let j = midIdx - 1; j > i; j--) {
                const curY = pixelPositions[i] + labelOffsets[sortedWithIndex[i].index];
                const prevY = pixelPositions[j] + labelOffsets[sortedWithIndex[j].index];
                if (curY > prevY && curY - prevY < labelHeight) {
                    labelOffsets[sortedWithIndex[i].index] -= (curY - (prevY + labelHeight));
                }
            }
        }

        // 构建series，应用偏移和板块名(涨幅)格式
        const finalSeries = displaySectors.map((sector, index) => {
            const color = colorPool[index % colorPool.length];
            const isPositive = sector.final_value >= 0;
            const changePct = sector.change_pct || 0;
            const pctStr = changePct >= 0 ? `+${changePct.toFixed(2)}%` : `${changePct.toFixed(2)}%`;
            const turnoverYi = sector.turnover_yi || 0;
            const valStr = sector.final_value >= 0 ? `+${sector.final_value.toFixed(2)}` : `${sector.final_value.toFixed(2)}`;
            const valColor = isPositive ? '#f85149' : '#3fb950';
            const pctColor = changePct >= 0 ? '#f85149' : '#3fb950';

            return {
                name: sector.name,
                type: 'line',
                data: sector.data,
                smooth: false,
                symbol: 'none',
                lineStyle: { width: 1.5, color: color },
                itemStyle: { color: color },
                // 末端标签：与tooltip格式一致，富文本实现红涨绿跌
                markPoint: {
                    symbol: 'circle',
                    symbolSize: 4,
                    itemStyle: { color: color },
                    label: {
                        show: true,
                        position: 'right',
                        formatter: [
                            `{name|${sector.name}}`,
                            `{pct|(${pctStr})}: `,
                            `{val|${valStr}亿} `,
                            `{turnover|${turnoverYi.toFixed(1)}亿}`
                        ].join(''),
                        fontSize: 10,
                        rich: {
                            name: { color: '#e6edf3',  fontWeight: 'normal' },
                            pct: { color: pctColor },
                            val: { color: valColor},
                            turnover: { color: '#58a6ff' }
                        },
                        offset: [0, labelOffsets[index]]
                    },
                    data: [{ coord: [times.length - 1, sector.final_value] }]
                }
            };
        });

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
                // tooltip始终在图表区域上下居中
                position: function(point, params, dom, rect, size) {
                    // point: 鼠标位置 [x, y]
                    // size: {contentSize: [width, height], viewSize: [chartWidth, chartHeight]}
                    const x = point[0] + 15;
                    const y = (size.viewSize[1] - size.contentSize[1]) / 2;
                    // 防止右侧溢出
                    const maxX = size.viewSize[0] - size.contentSize[0] - 10;
                    return [Math.min(x, maxX), Math.max(y, 10)];
                },
                formatter: function(params) {
                    if (!params || params.length === 0) return '';
                    let html = `<b>${params[0].axisValue}</b><br/>`;
                    // 按当前值排序
                    params.sort((a, b) => (b.value || 0) - (a.value || 0));
                    let totalTurnover = 0;
                    params.forEach(p => {
                        const sector = displaySectors.find(s => s.name === p.seriesName);
                        if (!sector) return;
                        const val = p.value !== undefined && p.value !== null ? p.value.toFixed(2) : '-';
                        const changePct = sector.change_pct || 0;
                        const turnoverYi = sector.turnover_yi || 0;
                        totalTurnover += turnoverYi;
                        const pctStr = changePct >= 0 ? `+${changePct.toFixed(2)}%` : `${changePct.toFixed(2)}%`;
                        const valStr = (p.value >= 0 ? '+' : '') + val + '亿';
                        const valColor = p.value >= 0 ? '#f85149' : '#3fb950';
                        const pctColor = changePct >= 0 ? '#f85149' : '#3fb950';
                        // 格式: 板块名(涨幅): 净流入 成交额
                        html += `<span style="color:${p.color}">●</span> ${p.seriesName}` +
                                `(<span style="color:${pctColor};font-weight:bold">${pctStr}</span>): ` +
                                `<span style="color:${valColor};font-weight:bold">${valStr}</span> ` +
                                `<span style="color:#58a6ff">${turnoverYi.toFixed(1)}亿</span><br/>`;
                    });
                    html += `<hr style="border-color:#30363d;margin:4px 0"/>` +
                            `<span style="color:#8b949e">总成交额: </span>` +
                            `<span style="color:#58a6ff;font-weight:bold">${totalTurnover.toFixed(1)}亿</span>`;
                    return html;
                }
            },
            legend: {
                show: false
            },
            grid: {
                left: '8%',
                right: '28%',
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
                axisTick: { show: false },
                min: yMin,
                max: yMax
            },
            // 零线参考线
            markLine: {
                silent: true,
                symbol: 'none',
                lineStyle: { color: '#8b949e', width: 1, type: 'solid' },
                data: [{ yAxis: 0 }]
            },
            series: finalSeries,
            animationDuration: 1000,
            animationEasing: 'cubicOut'
        };

        chart.setOption(option);

        // 点击右侧标签(markPoint)切换对应曲线显隐
        // 记录每个series的显隐状态
        const seriesVisible = new Array(finalSeries.length).fill(true);

        chart.on('click', function(params) {
            if (params.componentType === 'markPoint' && params.seriesName) {
                const seriesIndex = finalSeries.findIndex(s => s.name === params.seriesName);
                if (seriesIndex === -1) return;

                seriesVisible[seriesIndex] = !seriesVisible[seriesIndex];
                const visible = seriesVisible[seriesIndex];
                const color = colorPool[seriesIndex % colorPool.length];
                const sector = displaySectors[seriesIndex];
                const changePct = sector.change_pct || 0;
                const isPositive = sector.final_value >= 0;
                const pctColor = changePct >= 0 ? '#f85149' : '#3fb950';
                const valColor = isPositive ? '#f85149' : '#3fb950';

                // 构造更新：仅更新目标series
                const updates = new Array(finalSeries.length).fill(null);
                if (visible) {
                    // 恢复显示
                    updates[seriesIndex] = {
                        lineStyle: { width: 1.5, opacity: 1 },
                        markPoint: {
                            label: {
                                rich: {
                                    name: { color: '#e6edf3' },
                                    pct: { color: pctColor },
                                    val: { color: valColor },
                                    turnover: { color: '#58a6ff' }
                                }
                            }
                        }
                    };
                } else {
                    // 隐藏曲线，标签变灰
                    updates[seriesIndex] = {
                        lineStyle: { width: 0, opacity: 0 },
                        markPoint: {
                            label: {
                                rich: {
                                    name: { color: '#484f58' },
                                    pct: { color: '#484f58' },
                                    val: { color: '#484f58' },
                                    turnover: { color: '#484f58' }
                                }
                            }
                        }
                    };
                }
                chart.setOption({ series: updates });
            }
        });

        window.addEventListener('resize', () => chart.resize());
        return chart;
    },

    /**
     * 渲染板块数据表格 - 显示每个板块的实时涨幅、成交额、净流入额，支持点击表头排序
     * @param {HTMLElement} chartDom - 图表容器DOM
     * @param {Object} data - 板块数据
     * @returns {Object} 包含dispose方法的对象（与其他渲染方法保持一致）
     */
    renderTable(chartDom, data) {
        const sectors = data.sectors || [];
        if (sectors.length === 0) {
            chartDom.innerHTML = '<div style="text-align:center;padding:100px;color:#8b949e;">暂无数据</div>';
            return { dispose: () => {} };
        }

        // 当前排序状态
        let sortField = 'main_net_inflow_yi';
        let sortOrder = 'desc'; // desc=降序, asc=升序

        /**
         * 渲染表格HTML
         */
        function render() {
            // 排序数据
            const sorted = [...sectors].sort((a, b) => {
                let va = a[sortField];
                let vb = b[sortField];
                // 字符串字段用localeCompare
                if (sortField === 'name') {
                    return sortOrder === 'desc'
                        ? (vb || '').localeCompare(va || '', 'zh-CN')
                        : (va || '').localeCompare(vb || '', 'zh-CN');
                }
                va = va || 0;
                vb = vb || 0;
                return sortOrder === 'desc' ? vb - va : va - vb;
            });

            // 排序指示箭头
            const arrow = (field) => {
                if (sortField !== field) return ' <span style="color:#484f58">&#9650;&#9660;</span>';
                return sortOrder === 'desc' ? ' <span style="color:#58a6ff">&#9660;</span>' : ' <span style="color:#58a6ff">&#9650;</span>';
            };

            let html = `
            <div class="sector-table-title">${data.sector_type || '板块'} - ${data.indicator || '今日'}资金净流向</div>
            <table class="sector-table">
                <thead>
                    <tr>
                        <th class="sortable" data-field="name">板块${arrow('name')}</th>
                        <th class="sortable" data-field="change_pct">涨跌幅${arrow('change_pct')}</th>
                        <th class="sortable" data-field="main_net_inflow_yi">主力净流入(亿)${arrow('main_net_inflow_yi')}</th>
                        <th class="sortable" data-field="turnover_yi">成交额(亿)${arrow('turnover_yi')}</th>
                        <th class="sortable" data-field="main_net_inflow_pct">净流入占比${arrow('main_net_inflow_pct')}</th>
                    </tr>
                </thead>
                <tbody>`;

            sorted.forEach((s, i) => {
                const pct = s.change_pct || 0;
                const pctColor = pct >= 0 ? '#f85149' : '#3fb950';
                const pctStr = pct >= 0 ? `+${pct.toFixed(2)}%` : `${pct.toFixed(2)}%`;
                const val = s.main_net_inflow_yi || 0;
                const valColor = val >= 0 ? '#f85149' : '#3fb950';
                const valStr = val >= 0 ? `+${val.toFixed(2)}` : `${val.toFixed(2)}`;
                const turnover = s.turnover_yi || 0;
                const pctInflow = s.main_net_inflow_pct || 0;

                html += `
                    <tr>
                        <td class="sector-name">${s.name}</td>
                        <td style="color:${pctColor};font-weight:bold">${pctStr}</td>
                        <td style="color:${valColor};font-weight:bold">${valStr}</td>
                        <td style="color:#58a6ff">${turnover.toFixed(1)}</td>
                        <td>${pctInflow.toFixed(2)}%</td>
                    </tr>`;
            });

            html += '</tbody></table>';
            chartDom.innerHTML = html;

            // 绑定表头排序事件
            chartDom.querySelectorAll('th.sortable').forEach(th => {
                th.addEventListener('click', function() {
                    const field = this.dataset.field;
                    if (sortField === field) {
                        sortOrder = sortOrder === 'desc' ? 'asc' : 'desc';
                    } else {
                        sortField = field;
                        sortOrder = field === 'name' ? 'asc' : 'desc';
                    }
                    render();
                });
            });
        }

        render();
        return { dispose: () => { chartDom.innerHTML = ''; } };
    }
};
