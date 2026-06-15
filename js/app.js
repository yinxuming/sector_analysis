/**
 * 主应用逻辑
 * 负责数据加载、事件绑定、页面交互
 */

(function() {
    'use strict';

    let currentChart = null;
    let sectorListData = null;  // 板块列表数据缓存
    let selectedSectors = null; // 当前选中的板块（null=使用默认topN过滤）

    /**
     * 初始化应用
     */
    function init() {
        bindEvents();
        loadSectorList();
        loadData();
    }

    /**
     * 绑定事件
     */
    function bindEvents() {
        document.getElementById('sectorType').addEventListener('change', function() {
            selectedSectors = null; // 切换板块类型时重置选中
            loadSectorList();
            loadData();
        });
        document.getElementById('indicator').addEventListener('change', loadData);
        document.getElementById('chartType').addEventListener('change', function() {
            // 分时图模式下显示日期选择器和获取完整分时按钮，其他模式隐藏
            const isIntraday = this.value === 'intraday';
            document.getElementById('dateGroup').style.display = isIntraday ? '' : 'none';
            document.getElementById('intradayFullGroup').style.display = isIntraday ? '' : 'none';
            // 切换到分时图时，默认日期为今天
            if (isIntraday && !document.getElementById('intradayDate').value) {
                document.getElementById('intradayDate').value = new Date().toISOString().slice(0, 10);
            }
            loadData();
        });
        document.getElementById('topN').addEventListener('change', loadData);
        document.getElementById('intradayDate').addEventListener('change', loadData);
        document.getElementById('btnRefresh').addEventListener('click', loadData);

        // 获取完整分时数据按钮
        document.getElementById('btnIntradayFull').addEventListener('click', handleIntradayFull);

        // 板块配置面板
        document.getElementById('btnConfig').addEventListener('click', toggleConfigPanel);
        document.getElementById('btnCloseConfig').addEventListener('click', function() {
            document.getElementById('configPanel').style.display = 'none';
        });
        document.getElementById('btnSelectAll').addEventListener('click', function() {
            setAllCheckboxes(true);
        });
        document.getElementById('btnDeselectAll').addEventListener('click', function() {
            setAllCheckboxes(false);
        });
        document.getElementById('btnPreset').addEventListener('click', function() {
            selectPresetSectors();
        });
        document.getElementById('sectorSearch').addEventListener('input', filterSectors);
    }

    /**
     * 处理「获取完整分时数据」按钮点击
     * 调用后端API从东方财富获取全天240个分钟级采样点
     */
    async function handleIntradayFull() {
        const btn = document.getElementById('btnIntradayFull');
        const originalText = btn.textContent;

        // 按钮状态：禁用+加载中
        btn.disabled = true;
        btn.textContent = '获取中...';

        try {
            const resp = await fetch('/api/intraday-full');
            const result = await resp.json();

            if (result.success) {
                btn.textContent = '获取成功';
                btn.classList.add('success');
                // 自动切换到今天的分时数据并刷新图表
                document.getElementById('intradayDate').value = new Date().toISOString().slice(0, 10);
                loadData();
                // 3秒后恢复按钮
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = originalText;
                    btn.classList.remove('success');
                }, 3000);
            } else {
                btn.textContent = '获取失败';
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = originalText;
                }, 2000);
            }
        } catch (err) {
            console.error('获取完整分时数据失败:', err);
            btn.textContent = '请求失败（需本地服务支持）';
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = originalText;
            }, 2000);
        }
    }

    /**
     * 切换板块配置面板显示
     */
    function toggleConfigPanel() {
        const panel = document.getElementById('configPanel');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            renderSectorCheckboxes();
        } else {
            panel.style.display = 'none';
            // 关闭时应用选择
            applySectorSelection();
            loadData();
        }
    }

    /**
     * 加载板块列表数据
     */
    async function loadSectorList() {
        try {
            const data = await fetchJSON(CONFIG.dataPath + 'sector_list.json');
            sectorListData = data;
            renderSectorCheckboxes();
        } catch (err) {
            console.warn('板块列表加载失败，使用默认配置');
        }
    }

    /**
     * 渲染板块复选框列表
     */
    function renderSectorCheckboxes() {
        const container = document.getElementById('sectorCheckboxes');
        if (!sectorListData) return;

        const sectorType = document.getElementById('sectorType').value;
        const typeKey = sectorType === 'industry' ? 'industry' : 'concept';
        const allSectors = sectorListData[typeKey]?.all || [];
        const presetSectors = sectorListData[typeKey]?.preset || [];

        // 从localStorage恢复上次选择
        const storageKey = `selectedSectors_${typeKey}`;
        const saved = localStorage.getItem(storageKey);
        let checkedSectors;
        if (saved) {
            try { checkedSectors = JSON.parse(saved); } catch(e) { checkedSectors = presetSectors; }
        } else {
            checkedSectors = presetSectors.length > 0 ? presetSectors : allSectors;
        }

        container.innerHTML = '';
        allSectors.forEach(name => {
            const label = document.createElement('label');
            const checked = checkedSectors.includes(name);
            if (checked) label.classList.add('selected');
            label.innerHTML = `<input type="checkbox" value="${name}" ${checked ? 'checked' : ''} /> ${name}`;
            label.querySelector('input').addEventListener('change', function() {
                if (this.checked) {
                    label.classList.add('selected');
                } else {
                    label.classList.remove('selected');
                }
            });
            container.appendChild(label);
        });
    }

    /**
     * 全选/全不选
     */
    function setAllCheckboxes(checked) {
        const checkboxes = document.querySelectorAll('#sectorCheckboxes input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            cb.parentElement.classList.toggle('selected', checked);
        });
    }

    /**
     * 恢复预设选择
     */
    function selectPresetSectors() {
        if (!sectorListData) return;
        const sectorType = document.getElementById('sectorType').value;
        const typeKey = sectorType === 'industry' ? 'industry' : 'concept';
        const presetSectors = sectorListData[typeKey]?.preset || [];

        const checkboxes = document.querySelectorAll('#sectorCheckboxes input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const isPreset = presetSectors.includes(cb.value);
            cb.checked = isPreset;
            cb.parentElement.classList.toggle('selected', isPreset);
        });
    }

    /**
     * 搜索过滤板块
     */
    function filterSectors() {
        const keyword = document.getElementById('sectorSearch').value.trim().toLowerCase();
        const labels = document.querySelectorAll('#sectorCheckboxes label');
        labels.forEach(label => {
            const name = label.textContent.trim().toLowerCase();
            label.style.display = name.includes(keyword) ? '' : 'none';
        });
    }

    /**
     * 应用板块选择（保存到localStorage并更新selectedSectors）
     */
    function applySectorSelection() {
        const sectorType = document.getElementById('sectorType').value;
        const typeKey = sectorType === 'industry' ? 'industry' : 'concept';

        const checkboxes = document.querySelectorAll('#sectorCheckboxes input[type="checkbox"]:checked');
        const selected = Array.from(checkboxes).map(cb => cb.value);

        if (selected.length > 0) {
            localStorage.setItem(`selectedSectors_${typeKey}`, JSON.stringify(selected));
            selectedSectors = selected;
        } else {
            localStorage.removeItem(`selectedSectors_${typeKey}`);
            selectedSectors = null;
        }
    }

    /**
     * 获取当前选中的板块列表
     */
    function getSelectedSectors() {
        const sectorType = document.getElementById('sectorType').value;
        const typeKey = sectorType === 'industry' ? 'industry' : 'concept';
        const storageKey = `selectedSectors_${typeKey}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try { return JSON.parse(saved); } catch(e) { return null; }
        }
        return null;
    }

    /**
     * 加载数据并渲染图表
     * 优先使用东方财富API获取实时数据，本地JSON作为fallback
     */
    async function loadData() {
        const sectorType = document.getElementById('sectorType').value;
        const indicator = document.getElementById('indicator').value;
        const chartType = document.getElementById('chartType').value;

        const chartDom = document.getElementById('mainChart');

        // 销毁旧图表
        if (currentChart) {
            currentChart.dispose();
            currentChart = null;
        }

        try {
            if (chartType === 'barRace') {
                // Bar Race需要特殊数据（仅本地JSON）
                await loadBarRaceData(chartDom, sectorType);
            } else if (chartType === 'intraday') {
                // 分时图：优先东方财富API
                await loadIntradayData(chartDom, sectorType);
            } else {
                // 实时数据：优先东方财富API，fallback本地JSON
                await loadRealtimeData(chartDom, sectorType, indicator, chartType);
            }
        } catch (err) {
            console.error('数据加载失败:', err);
            chartDom.innerHTML = '<div style="text-align:center;padding:100px;color:#8b949e;">' +
                '<h2>数据加载失败</h2>' +
                '<p>请先运行 Python 脚本生成数据文件</p>' +
                '<p style="font-size:12px;margin-top:10px;">python main.py --export</p></div>';
        }
    }

    /**
     * 根据板块配置过滤数据
     */
    function filterDataBySectors(data) {
        const selected = getSelectedSectors();
        if (!selected || selected.length === 0) return data;

        const filtered = { ...data };
        filtered.sectors = data.sectors.filter(s => selected.includes(s.name));
        return filtered;
    }

    /**
     * 加载分时折线图数据
     * 今天：优先东方财富API（实时分钟级），fallback本地JSON
     * 历史日期：仅本地JSON（由GitHub Actions收盘后采集保存）
     */
    async function loadIntradayData(chartDom, sectorType) {
        let data = null;
        const selectedDate = document.getElementById('intradayDate').value || new Date().toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const isToday = selectedDate === today;

        // 今天的数据：优先尝试东方财富API（实时分钟级数据）
        if (isToday) {
            try {
                const topN = parseInt(document.getElementById('topN').value) || 30;
                data = await EastMoneyAPI.buildIntradayData(sectorType, topN);
                if (data) {
                    console.log('分时图数据来源: 东方财富API');
                }
            } catch (err) {
                console.warn('东方财富API获取分时数据失败，尝试本地JSON:', err);
            }
        }

        // Fallback: 本地JSON数据（今天或历史日期）
        if (!data) {
            try {
                const filename = `intraday_${sectorType}_${selectedDate}.json`;
                data = await fetchJSON(CONFIG.dataPath + filename);
                console.log(`分时图数据来源: 本地JSON (${selectedDate})`);
            } catch (err) {
                const hint = isToday
                    ? '东方财富API和本地数据均不可用'
                    : `${selectedDate} 无本地分时数据（仅保留近期数据）`;
                chartDom.innerHTML = '<div style="text-align:center;padding:100px;color:#8b949e;">' +
                    '<h2>暂无分时数据</h2>' +
                    `<p>${hint}</p>` +
                    '<p style="font-size:12px;margin-top:10px;">历史分时数据由每日收盘后自动采集</p></div>';
                return;
            }
        }

        // 应用板块过滤
        const filteredData = filterDataBySectors(data);
        currentChart = ChartRender.renderIntradayChart(chartDom, filteredData);

        // 更新时间和汇总
        const timeStr = data.update_time || '';
        const pointCount = data.times ? data.times.length : 0;
        const sourceTag = data.source === 'eastmoney' ? ' [东方财富API]' : ' [本地数据]';
        document.getElementById('updateTime').textContent =
            `分时图 | ${data.date || ''} | ${pointCount}个采样点 | ${timeStr}${sourceTag}`;

        // 分时图也更新汇总信息
        updateIntradaySummary(data);
    }

    /**
     * 加载实时排名数据（柱状图/热力图/桑基图）
     * 优先使用东方财富API获取今日数据，fallback到本地JSON
     */
    async function loadRealtimeData(chartDom, sectorType, indicator, chartType) {
        let data = null;

        // 今日数据优先使用东方财富API
        if (indicator === '今日') {
            try {
                data = await EastMoneyAPI.buildRealtimeData(sectorType);
                if (data) {
                    console.log('实时数据来源: 东方财富API');
                }
            } catch (err) {
                console.warn('东方财富API获取实时数据失败，尝试本地JSON:', err);
            }
        }

        // Fallback: 本地JSON数据
        if (!data) {
            try {
                let filename;
                if (indicator === '一周') {
                    const today = new Date().toISOString().slice(0, 10);
                    filename = `weekly_${sectorType}_${today}.json`;
                } else {
                    filename = `realtime_${sectorType}_${indicator}.json`;
                }
                data = await fetchJSON(CONFIG.dataPath + filename);
                console.log('实时数据来源: 本地JSON');
            } catch (err) {
                throw err;
            }
        }

        // 应用板块过滤
        const filteredData = filterDataBySectors(data);
        renderChart(chartDom, filteredData, chartType);
        updateSummary(filteredData);
    }

    /**
     * 更新分时图汇总信息
     */
    function updateIntradaySummary(data) {
        const sectors = data.sectors || [];
        const inflowSectors = sectors.filter(s => s.final_value > 0);
        const outflowSectors = sectors.filter(s => s.final_value < 0);

        document.getElementById('inflowCount').textContent = inflowSectors.length;
        document.getElementById('outflowCount').textContent = outflowSectors.length;

        if (inflowSectors.length > 0) {
            const maxIn = inflowSectors.reduce((a, b) =>
                a.final_value > b.final_value ? a : b);
            document.getElementById('maxInflow').textContent =
                `${maxIn.name} ${maxIn.final_value.toFixed(2)}亿`;
        } else {
            document.getElementById('maxInflow').textContent = '-';
        }

        if (outflowSectors.length > 0) {
            const maxOut = outflowSectors.reduce((a, b) =>
                a.final_value < b.final_value ? a : b);
            document.getElementById('maxOutflow').textContent =
                `${maxOut.name} ${maxOut.final_value.toFixed(2)}亿`;
        } else {
            document.getElementById('maxOutflow').textContent = '-';
        }
    }

    /**
     * 加载Bar Race数据
     */
    async function loadBarRaceData(chartDom, sectorType) {
        try {
            const filename = `bar_race_${sectorType}.json`;
            const data = await fetchJSON(CONFIG.dataPath + filename);
            currentChart = ChartRender.renderBarRace(chartDom, data);
            document.getElementById('updateTime').textContent =
                `动态排行 | 共${data.dates ? data.dates.length : 0}天数据 | 点击暂停/播放`;
        } catch (err) {
            chartDom.innerHTML = '<div style="text-align:center;padding:100px;color:#8b949e;">' +
                '<h2>暂无Bar Race数据</h2>' +
                '<p>需要积累多日快照数据后才能展示动态排行</p>' +
                '<p style="font-size:12px;margin-top:10px;">请先运行定时采集积累历史数据</p></div>';
        }
    }

    /**
     * 渲染图表
     */
    function renderChart(chartDom, data, chartType) {
        switch (chartType) {
            case 'bar':
                currentChart = ChartRender.renderBarChart(chartDom, data);
                break;
            case 'heatmap':
                currentChart = ChartRender.renderHeatmap(chartDom, data);
                break;
            case 'sankey':
                currentChart = ChartRender.renderSankey(chartDom, data);
                break;
            default:
                currentChart = ChartRender.renderBarChart(chartDom, data);
        }

        // 更新时间
        document.getElementById('updateTime').textContent =
            `数据更新时间: ${data.update_time || '-'}`;
    }

    /**
     * 更新汇总信息
     */
    function updateSummary(data) {
        const sectors = data.sectors || [];
        const inflowSectors = sectors.filter(s => s.main_net_inflow_yi > 0);
        const outflowSectors = sectors.filter(s => s.main_net_inflow_yi < 0);

        document.getElementById('inflowCount').textContent = inflowSectors.length;
        document.getElementById('outflowCount').textContent = outflowSectors.length;

        if (inflowSectors.length > 0) {
            const maxIn = inflowSectors.reduce((a, b) =>
                a.main_net_inflow_yi > b.main_net_inflow_yi ? a : b);
            document.getElementById('maxInflow').textContent =
                `${maxIn.name} ${maxIn.main_net_inflow_yi.toFixed(2)}亿`;
        } else {
            document.getElementById('maxInflow').textContent = '-';
        }

        if (outflowSectors.length > 0) {
            const maxOut = outflowSectors.reduce((a, b) =>
                a.main_net_inflow_yi < b.main_net_inflow_yi ? a : b);
            document.getElementById('maxOutflow').textContent =
                `${maxOut.name} ${maxOut.main_net_inflow_yi.toFixed(2)}亿`;
        } else {
            document.getElementById('maxOutflow').textContent = '-';
        }
    }

    /**
     * 请求JSON数据
     */
    async function fetchJSON(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return await response.json();
    }

    // 页面加载完成后初始化
    document.addEventListener('DOMContentLoaded', init);
})();
