/**
 * 主应用逻辑
 * 负责数据加载、事件绑定、页面交互
 */

(function() {
    'use strict';

    let currentChart = null;
    let sectorListData = null;  // 板块列表数据缓存
    let selectedSectors = null; // 当前选中的板块（null=使用默认topN过滤）
    let lastRefreshTime = 0;    // 上次刷新数据的时间戳（毫秒）
    let intradayRefreshTimer = null;  // 分时图自动刷新定时器
    let isLoading = false;      // 数据加载中标志，防止自动刷新与手动刷新重叠

    /**
     * 获取当前板块类型对应的typeKey
     * 'all' -> 'all', 'industry' -> 'industry', 'concept' -> 'concept'
     */
    function getTypeKey() {
        return document.getElementById('sectorType').value;
    }

    /**
     * 获取合并后的板块列表（全部模式下行概念同名板块加后缀区分）
     * @returns {{all: string[], preset: string[]}}
     */
    function getMergedSectorList() {
        const typeKey = getTypeKey();
        if (typeKey !== 'all' || !sectorListData) {
            return sectorListData?.[typeKey] || { all: [], preset: [] };
        }
        // 全部模式：合并行业+概念，同名时行业加"_行"后缀
        const industryAll = sectorListData.industry?.all || [];
        const conceptAll = sectorListData.concept?.all || [];
        const industryPreset = sectorListData.industry?.preset || [];
        const conceptPreset = sectorListData.concept?.preset || [];
        const conceptSet = new Set(conceptAll);

        const mergedAll = [];
        const mergedPreset = [];
        // 行业板块：与概念同名的加"_行"后缀
        industryAll.forEach(name => {
            const displayName = conceptSet.has(name) ? name + '_行' : name;
            mergedAll.push(displayName);
            if (industryPreset.includes(name)) mergedPreset.push(displayName);
        });
        // 概念板块：保持原名
        conceptAll.forEach(name => {
            mergedAll.push(name);
            if (conceptPreset.includes(name)) mergedPreset.push(name);
        });
        return { all: mergedAll, preset: mergedPreset };
    }

    /**
     * 将显示名称还原为原始板块名和类型
     * "_行"后缀的为行业板块，否则优先查概念板块（概念板块数量更多）
     * @param {string} displayName - 显示名称（可能带_行后缀）
     * @returns {{name: string, type: string}} 原始名称和板块类型
     */
    function parseDisplayName(displayName) {
        if (displayName.endsWith('_行')) {
            return { name: displayName.slice(0, -2), type: 'industry' };
        }
        // 无后缀：优先查概念板块（概念板块数量通常更多）
        const conceptAll = sectorListData?.concept?.all || [];
        if (conceptAll.includes(displayName)) {
            return { name: displayName, type: 'concept' };
        }
        return { name: displayName, type: 'industry' };
    }

    /**
     * 初始化应用
     */
    function init() {
        bindEvents();
        // 初始化日期选择器
        const chartType = document.getElementById('chartType').value;
        const isIntraday = chartType === 'intraday';
        document.getElementById('intradayFullGroup').style.display = isIntraday ? 'inline-flex' : 'none';
        if (!document.getElementById('intradayDate').value) {
            document.getElementById('intradayDate').value = new Date().toISOString().slice(0, 10);
        }
        // 初始化自定义日期段默认值（默认最近7天）
        const todayStr = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        if (!document.getElementById('startDate').value) {
            document.getElementById('startDate').value = weekAgo;
        }
        if (!document.getElementById('endDate').value) {
            document.getElementById('endDate').value = todayStr;
        }
        updateDatePickersVisibility();
        // 先加载板块列表，完成后再加载数据（确保板块过滤生效）
        loadSectorList().then(() => {
            loadData();
            // 初始数据加载后启动分时图自动刷新
            startIntradayAutoRefresh();
        });
    }

    /**
     * 更新日期选择器组的可见性
     * 规则：
     * - barRace隐藏所有日期选择器（需要多日数据，不需要选日期）
     * - intraday始终用单日期选择器（分时图只看单日）
     * - "自定义"指标显示日期范围选择器（仅柱状图/热力图/桑基图/表格）
     * - 其他情况显示单日期选择器
     */
    function updateDatePickersVisibility() {
        const chartType = document.getElementById('chartType').value;
        const indicator = document.getElementById('indicator').value;
        const isBarRace = chartType === 'barRace';
        const isIntraday = chartType === 'intraday';
        const isCustom = indicator === '自定义';
        // barRace不需要日期选择器
        if (isBarRace) {
            document.getElementById('dateGroup').style.display = 'none';
            document.getElementById('dateRangeGroup').style.display = 'none';
            return;
        }
        // intraday始终用单日期选择器
        if (isIntraday) {
            document.getElementById('dateGroup').style.display = 'inline-flex';
            document.getElementById('dateRangeGroup').style.display = 'none';
            return;
        }
        // "自定义"指标：显示日期范围选择器，隐藏单日期选择器
        if (isCustom) {
            document.getElementById('dateGroup').style.display = 'none';
            document.getElementById('dateRangeGroup').style.display = 'inline-flex';
        } else {
            document.getElementById('dateGroup').style.display = 'inline-flex';
            document.getElementById('dateRangeGroup').style.display = 'none';
        }
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
        document.getElementById('indicator').addEventListener('change', function() {
            updateDatePickersVisibility();
            loadData();
            // 指标变化后重新评估自动刷新
            startIntradayAutoRefresh();
        });
        document.getElementById('chartType').addEventListener('change', function() {
            const isBarRace = this.value === 'barRace';
            // 获取完整分时按钮仅分时图显示
            const isIntraday = this.value === 'intraday';
            document.getElementById('intradayFullGroup').style.display = isIntraday ? 'inline-flex' : 'none';
            // 切换图表时，默认日期为今天
            if (!isBarRace && !document.getElementById('intradayDate').value) {
                document.getElementById('intradayDate').value = new Date().toISOString().slice(0, 10);
            }
            // 时间指标在动态排行模式下隐藏（不需要）
            document.getElementById('indicator').parentElement.style.display = isBarRace ? 'none' : 'inline-flex';
            updateDatePickersVisibility();
            loadData();
            // 图表类型变化后重新评估自动刷新
            startIntradayAutoRefresh();
        });
        document.getElementById('topN').addEventListener('change', loadData);
        document.getElementById('intradayDate').addEventListener('change', function() {
            // 历史日期下，时间指标强制为"今日"并禁用（历史数据只有当日数据）
            const selectedDate = this.value || new Date().toISOString().slice(0, 10);
            const today = new Date().toISOString().slice(0, 10);
            const indicatorSelect = document.getElementById('indicator');
            if (selectedDate !== today) {
                indicatorSelect.value = '今日';
                indicatorSelect.disabled = true;
            } else {
                indicatorSelect.disabled = false;
            }
            loadData();
            // 日期变化后重新评估自动刷新（历史日期不自动刷新）
            startIntradayAutoRefresh();
        });
        // 自定义日期段变化事件
        document.getElementById('startDate').addEventListener('change', loadData);
        document.getElementById('endDate').addEventListener('change', loadData);
        // 分时图自动刷新间隔选择
        document.getElementById('intradayRefreshInterval').addEventListener('change', function() {
            console.log(`刷新间隔变更为: ${this.value}秒`);
            startIntradayAutoRefresh();
        });
        document.getElementById('btnRefresh').addEventListener('click', loadData);

        // 获取完整分时数据按钮
        document.getElementById('btnIntradayFull').addEventListener('click', handleIntradayFull);

        // 设置面板
        document.getElementById('btnSettings').addEventListener('click', toggleSettingsPanel);
        document.getElementById('btnCloseSettings').addEventListener('click', function() {
            document.getElementById('settingsPanel').style.display = 'none';
        });

        // 板块配置面板（按钮在设置面板内，点击打开板块配置并关闭设置面板）
        document.getElementById('btnConfig').addEventListener('click', function() {
            document.getElementById('settingsPanel').style.display = 'none';
            toggleConfigPanel();
        });
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
        document.getElementById('btnExport').addEventListener('click', exportSelectedSectors);
        document.getElementById('btnImport').addEventListener('click', importSelectedSectors);
        document.getElementById('importFile').addEventListener('change', handleImportFile);
        document.getElementById('sectorSearch').addEventListener('input', filterSectors);

        // 页面可见性变化监听
        // 1. 从不可见到可见时，超过阈值自动刷新（保留旧图表避免空白）
        // 2. 可见→隐藏：停止自动刷新定时器；隐藏→可见：恢复自动刷新
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible') {
                const now = Date.now();
                const elapsed = now - lastRefreshTime;
                // 仅当日实时数据（今天 + 今日指标）才自动刷新
                const selectedDate = document.getElementById('intradayDate').value || new Date().toISOString().slice(0, 10);
                const today = new Date().toISOString().slice(0, 10);
                const indicator = document.getElementById('indicator').value;
                if (selectedDate === today && indicator === '今日' && elapsed > CONFIG.refreshThreshold) {
                    console.log(`页面可见，距离上次刷新${Math.round(elapsed/1000)}秒，超过阈值${CONFIG.refreshThreshold/1000}秒，自动刷新（保留旧图表）`);
                    loadData(true);
                }
                // 恢复分时图自动刷新
                startIntradayAutoRefresh();
            } else {
                // 页面隐藏时停止自动刷新，节省资源
                stopIntradayAutoRefresh();
            }
        });
    }

    /**
     * 处理「获取完整分时数据」按钮点击
     * 今天：通过东方财富API获取实时分时数据（优先后端，fallback前端代理）
     * 历史日期：从本地JSON文件加载（由GitHub Actions收盘后采集保存）
     */
    async function handleIntradayFull() {
        const btn = document.getElementById('btnIntradayFull');
        const originalText = btn.textContent;
        const selectedDate = document.getElementById('intradayDate').value || new Date().toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const isToday = selectedDate === today;

        btn.disabled = true;
        btn.textContent = '获取中...';

        try {
            if (isToday) {
                // 今天：优先后端API，fallback前端代理
                let result = null;
                try {
                    const resp = await fetch('/api/intraday-full');
                    result = await resp.json();
                } catch (e) {
                    console.log('后端API不可用，通过前端代理获取分时数据');
                }

                if (!result || !result.success) {
                    const sectorType = getTypeKey();
                    const topN = getTopNValue() === -1 ? 500 : (getTopNValue() || 30);
                    const selectedNames = getFilterParam();
                    // "全部"模式分别获取行业和概念
                    if (sectorType === 'all') {
                        const [indResult, conResult] = await Promise.all([
                            EastMoneyAPI.buildIntradayData('industry', topN, selectedNames),
                            EastMoneyAPI.buildIntradayData('concept', topN, selectedNames)
                        ]);
                        result = (indResult || conResult) ? { success: true } : { success: false, message: '东方财富API获取失败' };
                    } else {
                        const data = await EastMoneyAPI.buildIntradayData(sectorType, topN, selectedNames);
                        result = data ? { success: true } : { success: false, message: '东方财富API获取失败' };
                    }
                }

                if (result.success) {
                    btn.textContent = '获取成功';
                    btn.classList.add('success');
                    // 清除前端缓存，确保loadData从API/本地JSON获取最新数据
                    clearIntradayCache(selectedDate);
                    loadData();
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = originalText;
                        btn.classList.remove('success');
                    }, 3000);
                } else {
                    btn.textContent = result.message || '获取失败';
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = originalText;
                    }, 2000);
                }
            } else {
                // 历史日期：直接从本地JSON加载
                loadData();
                btn.textContent = '已加载';
                setTimeout(() => {
                    btn.disabled = false;
                    btn.textContent = originalText;
                }, 1500);
            }
        } catch (err) {
            console.error('获取完整分时数据失败:', err);
            btn.textContent = '获取失败';
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
     * 渲染板块复选框列表（已勾选排前面，其余按自然顺序）
     */
    function renderSectorCheckboxes() {
        const container = document.getElementById('sectorCheckboxes');
        if (!sectorListData) return;

        const typeKey = getTypeKey();
        const mergedList = getMergedSectorList();
        const allSectors = mergedList.all;
        const presetSectors = mergedList.preset;

        // 从localStorage恢复上次选择
        const storageKey = `selectedSectors_${typeKey}`;
        const saved = localStorage.getItem(storageKey);
        let checkedSectors;
        if (saved) {
            try { checkedSectors = JSON.parse(saved); } catch(e) { checkedSectors = presetSectors; }
        } else {
            checkedSectors = presetSectors.length > 0 ? presetSectors : allSectors;
        }

        // 排序：已勾选的排前面，未勾选的按自然顺序
        const sortedSectors = [...allSectors].sort((a, b) => {
            const aChecked = checkedSectors.includes(a);
            const bChecked = checkedSectors.includes(b);
            if (aChecked !== bChecked) return aChecked ? -1 : 1;
            return a.localeCompare(b, 'zh-CN');
        });

        container.innerHTML = '';
        sortedSectors.forEach(name => {
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
                // 勾选变化实时保存到localStorage
                saveSectorSelection();
            });
            container.appendChild(label);
        });

        // 如果localStorage中没有保存过选择，将当前勾选状态（预设或默认）存入localStorage
        if (!saved) {
            localStorage.setItem(`selectedSectors_${typeKey}`, JSON.stringify(checkedSectors));
        }
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
        const mergedList = getMergedSectorList();
        const presetSectors = mergedList.preset;

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
     * 保存板块选择到localStorage（实时保存）
     */
    function saveSectorSelection() {
        const typeKey = getTypeKey();

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
     * 应用板块选择（关闭配置面板时调用）
     */
    function applySectorSelection() {
        saveSectorSelection();
    }

    /**
     * 导出已选择板块为JSON文件（同时包含行业和概念板块）
     * "全部"模式下从selectedSectors_all中拆分出行业和概念
     */
    function exportSelectedSectors() {
        let industrySectors = [];
        let conceptSectors = [];

        // 从各自的localStorage key读取
        const industrySaved = localStorage.getItem('selectedSectors_industry');
        const conceptSaved = localStorage.getItem('selectedSectors_concept');
        if (industrySaved) {
            try { industrySectors = JSON.parse(industrySaved); } catch(e) { industrySectors = []; }
        }
        if (conceptSaved) {
            try { conceptSectors = JSON.parse(conceptSaved); } catch(e) { conceptSectors = []; }
        }

        // "全部"模式下，从selectedSectors_all拆分（覆盖上面的值，更准确）
        const typeKey = getTypeKey();
        if (typeKey === 'all') {
            const allSaved = localStorage.getItem('selectedSectors_all');
            if (allSaved) {
                try {
                    const allNames = JSON.parse(allSaved);
                    industrySectors = [];
                    conceptSectors = [];
                    allNames.forEach(name => {
                        const parsed = parseDisplayName(name);
                        if (parsed.type === 'industry') {
                            industrySectors.push(parsed.name);
                        } else {
                            conceptSectors.push(parsed.name);
                        }
                    });
                } catch(e) {}
            }
        }

        const exportData = {
            exportTime: new Date().toISOString(),
            industry: industrySectors,
            concept: conceptSectors
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sector_selection_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 导入已选择板块JSON文件
     */
    function importSelectedSectors() {
        document.getElementById('importFile').click();
    }

    /**
     * 处理导入文件（同时导入行业和概念板块）
     */
    function handleImportFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                const currentTypeKey = getTypeKey();
                let importedCount = 0;
                let skippedCount = 0;
                const types = ['industry', 'concept'];

                // 兼容旧格式（只有selectedSectors字段）
                if (data.selectedSectors && !data.industry && !data.concept) {
                    const typeKey = data.sectorType || currentTypeKey;
                    const allSectors = sectorListData[typeKey]?.all || [];
                    const validSectors = data.selectedSectors.filter(name => allSectors.includes(name));
                    if (validSectors.length > 0) {
                        localStorage.setItem(`selectedSectors_${typeKey}`, JSON.stringify(validSectors));
                        if (typeKey === currentTypeKey) selectedSectors = validSectors;
                        importedCount += validSectors.length;
                        skippedCount += data.selectedSectors.length - validSectors.length;
                    }
                } else {
                    // 新格式：同时包含industry和concept
                    for (const typeKey of types) {
                        const sectors = data[typeKey];
                        if (!sectors || !Array.isArray(sectors)) continue;
                        const allSectors = sectorListData[typeKey]?.all || [];
                        const validSectors = sectors.filter(name => allSectors.includes(name));
                        if (validSectors.length > 0) {
                            localStorage.setItem(`selectedSectors_${typeKey}`, JSON.stringify(validSectors));
                            importedCount += validSectors.length;
                            skippedCount += sectors.length - validSectors.length;
                        }
                    }
                    // "全部"模式下还需构建selectedSectors_all（带_行后缀）
                    if (currentTypeKey === 'all') {
                        const allDisplayNames = [];
                        const conceptAll = new Set(sectorListData?.concept?.all || []);
                        for (const typeKey of types) {
                            const sectors = data[typeKey];
                            if (!sectors || !Array.isArray(sectors)) continue;
                            const allSectors = sectorListData[typeKey]?.all || [];
                            const validSectors = sectors.filter(name => allSectors.includes(name));
                            validSectors.forEach(name => {
                                if (typeKey === 'industry' && conceptAll.has(name)) {
                                    allDisplayNames.push(name + '_行');
                                } else {
                                    allDisplayNames.push(name);
                                }
                            });
                        }
                        if (allDisplayNames.length > 0) {
                            localStorage.setItem('selectedSectors_all', JSON.stringify(allDisplayNames));
                            selectedSectors = allDisplayNames;
                        }
                    } else {
                        // 单类型模式下更新当前选中
                        const saved = localStorage.getItem(`selectedSectors_${currentTypeKey}`);
                        if (saved) {
                            try { selectedSectors = JSON.parse(saved); } catch(e) {}
                        }
                    }
                }

                if (importedCount === 0) {
                    alert('导入失败：没有匹配的板块名称');
                    return;
                }

                // 重新渲染
                renderSectorCheckboxes();

                let msg = `成功导入 ${importedCount} 个板块（行业+概念）`;
                if (skippedCount > 0) {
                    msg += `（${skippedCount} 个板块名称不匹配已忽略）`;
                }
                alert(msg);
            } catch (err) {
                alert('导入失败：文件解析错误 - ' + err.message);
            }
        };
        reader.readAsText(file);
        // 重置file input，允许重复选择同一文件
        event.target.value = '';
    }

    /**
     * 获取topN值（数字），如果是"已选择板块"返回-1
     */
    function getTopNValue() {
        const val = document.getElementById('topN').value;
        return val === 'selected' ? -1 : parseInt(val) || 30;
    }

    /**
     * 获取当前选中的板块名称列表
     * 无localStorage时使用预设板块作为默认值
     */
    function getSelectedSectorNames() {
        const typeKey = getTypeKey();
        const storageKey = `selectedSectors_${typeKey}`;
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try { return JSON.parse(saved); } catch(e) { return null; }
        }
        // 无localStorage时，使用预设板块作为默认值
        const mergedList = getMergedSectorList();
        if (mergedList.preset.length > 0) {
            return mergedList.preset;
        }
        return null;
    }

    /**
     * 获取过滤参数：topN为"已选择板块"时返回selectedNames，否则返回null
     */
    function getFilterParam() {
        return getTopNValue() === -1 ? getSelectedSectorNames() : null;
    }

    // ========== 分时数据前端缓存（localStorage） ==========
    // 当日已从东方财富API获取的分时数据缓存到localStorage，避免频繁请求API
    // 缓存TTL由CONFIG.intradayCacheTTL控制（默认60秒）

    /**
     * 获取分时数据缓存的localStorage key
     * @param {string} sectorType - 板块类型
     * @param {string} date - 日期
     * @returns {string} cache key
     */
    function getIntradayCacheKey(sectorType, date) {
        return `intraday_cache_${sectorType}_${date}`;
    }

    /**
     * 保存分时数据到localStorage缓存
     * @param {string} sectorType - 板块类型
     * @param {string} date - 日期
     * @param {Object} data - 分时数据
     */
    function saveIntradayCache(sectorType, date, data) {
        try {
            const cacheKey = getIntradayCacheKey(sectorType, date);
            const cacheEntry = {
                data: data,
                timestamp: Date.now(),
                ttl: CONFIG.intradayCacheTTL * 1000
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheEntry));
            console.log(`分时数据已缓存: ${sectorType} ${date}`);
        } catch (e) {
            console.warn('缓存分时数据失败:', e.message);
        }
    }

    /**
     * 从localStorage读取分时数据缓存（未过期才返回）
     * @param {string} sectorType - 板块类型
     * @param {string} date - 日期
     * @returns {Object|null} 缓存的数据，无缓存或已过期返回null
     */
    function loadIntradayCache(sectorType, date) {
        try {
            const cacheKey = getIntradayCacheKey(sectorType, date);
            const raw = localStorage.getItem(cacheKey);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            const elapsed = Date.now() - entry.timestamp;
            if (elapsed > entry.ttl) {
                console.log(`缓存已过期(${Math.round(elapsed/1000)}秒): ${sectorType} ${date}`);
                localStorage.removeItem(cacheKey);
                return null;
            }
            console.log(`命中缓存(${Math.round(elapsed/1000)}秒前): ${sectorType} ${date}`);
            return entry.data;
        } catch (e) {
            console.warn('读取分时缓存失败:', e.message);
            return null;
        }
    }

    /**
     * 清除指定日期的分时数据缓存（获取完整分时数据后调用，确保刷新使用新数据）
     * @param {string} date - 日期，默认今天
     */
    function clearIntradayCache(date) {
        const targetDate = date || new Date().toISOString().slice(0, 10);
        ['industry', 'concept'].forEach(sectorType => {
            const cacheKey = getIntradayCacheKey(sectorType, targetDate);
            localStorage.removeItem(cacheKey);
        });
        console.log(`已清除${targetDate}的分时数据缓存`);
    }

    // ========== 分时图自动刷新管理 ==========

    /**
     * 启动分时图自动刷新定时器
     * 仅在分时图模式 + 当日 + 页面可见时启动
     */
    function startIntradayAutoRefresh() {
        stopIntradayAutoRefresh();
        const chartType = document.getElementById('chartType').value;
        const selectedDate = document.getElementById('intradayDate').value || new Date().toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const indicator = document.getElementById('indicator').value;
        // 仅分时图 + 今日 + 今日指标才自动刷新
        if (chartType !== 'intraday' || selectedDate !== today || indicator !== '今日') {
            return;
        }
        const intervalSeconds = parseInt(document.getElementById('intradayRefreshInterval').value) || 0;
        if (intervalSeconds <= 0) {
            return;
        }
        console.log(`启动分时图自动刷新，间隔${intervalSeconds}秒`);
        intradayRefreshTimer = setInterval(() => {
            // 页面不可见时跳过刷新（visibilitychange会单独处理）
            if (document.visibilityState !== 'visible') return;
            console.log('分时图自动刷新触发');
            loadData(true);
        }, intervalSeconds * 1000);
    }

    /**
     * 停止分时图自动刷新定时器
     */
    function stopIntradayAutoRefresh() {
        if (intradayRefreshTimer) {
            clearInterval(intradayRefreshTimer);
            intradayRefreshTimer = null;
            console.log('分时图自动刷新已停止');
        }
    }

    /**
     * 切换设置面板显示
     */
    function toggleSettingsPanel() {
        const panel = document.getElementById('settingsPanel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }

    /**
     * 加载数据并渲染图表
     * 优先使用东方财富API获取实时数据，本地JSON作为fallback
     * "全部"模式下分别获取行业和概念数据后合并
     * @param {boolean} preserveOldChart - 是否保留旧图表直到新数据就绪（用于页面可见性刷新，避免空白）
     */
    async function loadData(preserveOldChart = false) {
        // 防止自动刷新与手动刷新重叠
        if (isLoading) {
            console.log('数据正在加载中，跳过本次刷新');
            return;
        }
        isLoading = true;
        // 记录刷新时间
        lastRefreshTime = Date.now();

        const sectorType = getTypeKey();
        const indicator = document.getElementById('indicator').value;
        const chartType = document.getElementById('chartType').value;

        const chartDom = document.getElementById('mainChart');

        // 仅在不保留旧图表时立即销毁（原行为，用于切换图表类型/指标等场景）
        // preserveOldChart=true时延迟到渲染前才销毁，避免数据加载期间出现空白
        if (!preserveOldChart && currentChart) {
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
            } else if (indicator === '自定义') {
                // 自定义日期段：聚合多日intraday JSON数据
                await loadCustomRangeData(chartDom, sectorType, chartType);
            } else {
                // 实时数据：优先东方财富API，fallback本地JSON
                await loadRealtimeData(chartDom, sectorType, indicator, chartType);
            }
        } catch (err) {
            console.error('数据加载失败:', err);
            if (preserveOldChart && currentChart) {
                // 保留旧图表，仅在更新时间区域提示错误，避免覆盖现有显示
                console.warn('保留旧图表数据显示，数据刷新失败');
                const updateTimeEl = document.getElementById('updateTime');
                if (updateTimeEl) {
                    updateTimeEl.textContent = `数据刷新失败，显示旧数据: ${err.message}`;
                }
            } else {
                chartDom.innerHTML = '<div style="text-align:center;padding:100px;color:#8b949e;">' +
                    '<h2>数据加载失败</h2>' +
                    '<p>请先运行 Python 脚本生成数据文件</p>' +
                    '<p style="font-size:12px;margin-top:10px;">python main.py --export</p></div>';
            }
        } finally {
            isLoading = false;
        }
    }

    /**
     * 加载自定义日期段数据并渲染图表
     * 遍历日期范围内每个日期的intraday JSON文件，聚合（净流入求和、成交额求和、涨幅取平均）后渲染
     * @param {HTMLElement} chartDom - 图表容器DOM
     * @param {string} sectorType - 板块类型
     * @param {string} chartType - 图表类型
     */
    async function loadCustomRangeData(chartDom, sectorType, chartType) {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;

        if (!startDate || !endDate) {
            throw new Error('请选择起止日期');
        }
        if (startDate > endDate) {
            throw new Error('开始日期不能晚于结束日期');
        }
        // 限制最大范围30天（数据保留期）
        const diffDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000);
        if (diffDays > 30) {
            throw new Error('自定义日期段最多30天，请缩小范围');
        }

        // 生成日期列表（含非交易日，无JSON文件时自动跳过）
        const dates = [];
        let current = new Date(startDate);
        const end = new Date(endDate);
        while (current <= end) {
            dates.push(current.toISOString().slice(0, 10));
            current.setDate(current.getDate() + 1);
        }

        // "全部"模式：分别聚合行业和概念，然后合并
        if (sectorType === 'all') {
            const [industryData, conceptData] = await Promise.all([
                aggregateIntradayRange('industry', dates),
                aggregateIntradayRange('concept', dates)
            ]);
            const data = mergeIndustryConceptData(industryData, conceptData);
            if (!data) throw new Error('所选日期段无数据，请确认日期范围内有已采集的数据');
            const filteredData = filterDataBySectors(data);
            renderChart(chartDom, filteredData, chartType);
            updateSummary(filteredData);
            return;
        }

        const data = await aggregateIntradayRange(sectorType, dates);
        if (!data) throw new Error('所选日期段无数据，请确认日期范围内有已采集的数据');
        const filteredData = filterDataBySectors(data);
        renderChart(chartDom, filteredData, chartType);
        updateSummary(filteredData);
    }

    /**
     * 聚合日期范围内多个intraday JSON的数据
     * 并行加载所有日期的intraday文件，对每个板块：净流入求和、成交额求和、涨幅取平均
     * @param {string} sectorType - 板块类型
     * @param {string[]} dates - 日期列表
     * @returns {Promise<Object|null>} 聚合后的realtime格式数据，无数据时返回null
     */
    async function aggregateIntradayRange(sectorType, dates) {
        // 并行加载所有日期的intraday JSON，文件不存在时静默跳过
        const results = await Promise.all(
            dates.map(date =>
                fetchJSON(CONFIG.dataPath + `intraday_${sectorType}_${date}.json`)
                    .then(data => ({ data, date }))
                    .catch(() => null)
            )
        );

        // 过滤出成功加载的日期数据
        const validResults = results.filter(r => r !== null && r.data && r.data.sectors);
        if (validResults.length === 0) return null;

        // 按板块名称聚合：净流入求和、成交额求和、涨幅收集用于取平均
        const sectorMap = {};
        validResults.forEach(({ data }) => {
            (data.sectors || []).forEach(s => {
                if (!sectorMap[s.name]) {
                    sectorMap[s.name] = {
                        name: s.name,
                        totalInflow: 0,
                        totalTurnover: 0,
                        changePcts: []
                    };
                }
                sectorMap[s.name].totalInflow += (s.final_value || 0);
                sectorMap[s.name].totalTurnover += (s.turnover_yi || 0);
                sectorMap[s.name].changePcts.push(s.change_pct || 0);
            });
        });

        // 转换为realtime排名格式
        const sectors = Object.values(sectorMap).map(s => {
            const avgChangePct = s.changePcts.length > 0
                ? s.changePcts.reduce((a, b) => a + b, 0) / s.changePcts.length
                : 0;
            return {
                name: s.name,
                main_net_inflow: Math.round(s.totalInflow * 100) / 100,
                change_percent: Math.round(avgChangePct * 100) / 100,
                turnover: Math.round(s.totalTurnover * 100) / 100,
                main_net_inflow_pct: s.totalTurnover
                    ? Math.round((s.totalInflow / s.totalTurnover * 100) * 100) / 100
                    : 0
            };
        });

        return {
            update_time: `${validResults[0].date} ~ ${validResults[validResults.length - 1].date}`,
            date: `${dates[0]}~${dates[dates.length - 1]}`,
            indicator: '自定义',
            sector_type: validResults[0].data.sector_type || '',
            sectors: sectors,
            source: 'custom_range_aggregate'
        };
    }

    /**
     * 合并行业和概念板块数据（用于"全部"模式）
     * 同名板块：行业板块名称加"_行"后缀
     * @param {Object} industryData - 行业板块数据
     * @param {Object} conceptData - 概念板块数据
     * @param {string} mergeField - 合并的板块数组字段名（sectors）
     * @returns {Object} 合并后的数据
     */
    function mergeIndustryConceptData(industryData, conceptData) {
        if (!industryData && !conceptData) return null;
        if (!industryData) return conceptData;
        if (!conceptData) return industryData;

        // 收集概念板块名称集合，用于判断同名
        const conceptNames = new Set((conceptData.sectors || []).map(s => s.name));

        // 行业板块中与概念同名的加"_行"后缀
        const industrySectors = (industryData.sectors || []).map(s => ({
            ...s,
            name: conceptNames.has(s.name) ? s.name + '_行' : s.name
        }));

        // 合并时间轴（分时图数据需要对齐）
        let mergedTimes = conceptData.times || [];
        const industryTimes = industryData.times || [];
        if (mergedTimes.length === 0 && industryTimes.length > 0) {
            mergedTimes = industryTimes;
        } else if (industryTimes.length > 0) {
            // 合并两个时间轴，取并集并排序
            const timeSet = new Set([...mergedTimes, ...industryTimes]);
            mergedTimes = [...timeSet].sort();
            // 对齐行业板块数据到合并后的时间轴
            industrySectors.forEach(sector => {
                const indTimeMap = {};
                (industryData.times || []).forEach((t, i) => {
                    indTimeMap[t] = sector.data[i];
                });
                sector.data = mergedTimes.map(t => indTimeMap[t] !== undefined ? indTimeMap[t] : null);
            });
            // 对齐概念板块数据到合并后的时间轴
            (conceptData.sectors || []).forEach((sector, idx) => {
                const conTimeMap = {};
                (conceptData.times || []).forEach((t, i) => {
                    conTimeMap[t] = sector.data[i];
                });
                sector.data = mergedTimes.map(t => conTimeMap[t] !== undefined ? conTimeMap[t] : null);
            });
        }

        const merged = {
            ...conceptData,
            times: mergedTimes,
            sectors: [...industrySectors, ...(conceptData.sectors || [])],
            sector_type: '全部板块',
            update_time: industryData.update_time || conceptData.update_time
        };
        return merged;
    }

    /**
     * 根据板块配置过滤数据
     * topN="已选择板块"时只保留已选板块；topN为数字时截取前N个
     */
    function filterDataBySectors(data) {
        const topN = getTopNValue();
        const filtered = { ...data };

        if (topN === -1) {
            // 已选择板块模式
            const selected = getSelectedSectorNames();
            if (selected && selected.length > 0) {
                filtered.sectors = data.sectors.filter(s => selected.includes(s.name));
            }
        } else if (topN > 0) {
            // 前N个模式
            filtered.sectors = data.sectors.slice(0, topN);
        }
        // topN===0 为全部，不过滤

        return filtered;
    }

    /**
     * 加载分时折线图数据
     * 今天：优先东方财富API（实时分钟级），fallback本地JSON
     * 历史日期：仅本地JSON（由GitHub Actions收盘后采集保存）
     */
    async function loadIntradayData(chartDom, sectorType) {
        // "全部"模式：分别获取行业和概念数据后合并
        if (sectorType === 'all') {
            const [industryData, conceptData] = await Promise.all([
                loadIntradayDataSingle(chartDom, 'industry'),
                loadIntradayDataSingle(chartDom, 'concept')
            ]);
            const data = mergeIndustryConceptData(industryData, conceptData);
            if (!data) {
                const selectedDate = document.getElementById('intradayDate').value || new Date().toISOString().slice(0, 10);
                const today = new Date().toISOString().slice(0, 10);
                const hint = selectedDate === today
                    ? '东方财富API和本地数据均不可用'
                    : `${selectedDate} 无本地分时数据（仅保留近期数据）`;
                chartDom.innerHTML = '<div style="text-align:center;padding:100px;color:#8b949e;">' +
                    '<h2>暂无分时数据</h2>' +
                    `<p>${hint}</p>` +
                    '<p style="font-size:12px;margin-top:10px;">历史分时数据由每日收盘后自动采集</p></div>';
                return;
            }
            const filteredData = filterDataBySectors(data);
            adjustChartHeight(chartDom, filteredData, 'intraday');
            currentChart = ChartRender.renderIntradayChart(chartDom, filteredData);
            const timeStr = data.update_time || '';
            const pointCount = data.times ? data.times.length : 0;
            document.getElementById('updateTime').textContent =
                `分时图 | ${data.date || ''} | ${pointCount}个采样点 | ${timeStr}`;
            updateIntradaySummary(data);
            return;
        }
        await loadIntradayDataSingle(chartDom, sectorType);
    }

    /**
     * 加载单个板块类型的分时数据
     * 数据优先级：前端缓存(localStorage) → 东方财富API → 本地JSON文件
     * API获取成功后自动缓存到localStorage，避免频繁请求
     * @returns {Promise<Object|null>} 分时数据对象，失败返回null
     */
    async function loadIntradayDataSingle(chartDom, sectorType) {
        let data = null;
        const selectedDate = document.getElementById('intradayDate').value || new Date().toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const isToday = selectedDate === today;

        // 今天的数据：优先尝试前端缓存（未过期），命中则直接使用
        if (isToday) {
            const cached = loadIntradayCache(sectorType, selectedDate);
            if (cached) {
                data = cached;
                console.log(`分时图数据来源(${sectorType}): 前端缓存 (${selectedDate})`);
            }
        }

        // 缓存未命中：尝试东方财富API（实时分钟级数据）
        if (!data && isToday) {
            try {
                const topN = getTopNValue() === -1 ? 500 : (getTopNValue() || 30);
                const selectedNames = getFilterParam();
                data = await EastMoneyAPI.buildIntradayData(sectorType, topN, selectedNames);
                if (data) {
                    console.log(`分时图数据来源(${sectorType}): 东方财富API`);
                    // API获取成功后缓存到localStorage，供后续刷新使用
                    saveIntradayCache(sectorType, selectedDate, data);
                }
            } catch (err) {
                console.warn(`东方财富API获取${sectorType}分时数据失败，尝试本地JSON:`, err);
            }
        }

        // Fallback: 本地JSON数据（今天或历史日期）
        if (!data) {
            try {
                const filename = `intraday_${sectorType}_${selectedDate}.json`;
                data = await fetchJSON(CONFIG.dataPath + filename);
                console.log(`分时图数据来源(${sectorType}): 本地JSON (${selectedDate})`);
            } catch (err) {
                console.warn(`本地分时数据加载失败(${sectorType}, ${selectedDate}):`, err.message);
                return null;
            }
        }

        // 单类型模式：直接渲染
        if (getTypeKey() !== 'all') {
            const filteredData = filterDataBySectors(data);
            adjustChartHeight(chartDom, filteredData, 'intraday');
            currentChart = ChartRender.renderIntradayChart(chartDom, filteredData);
            const timeStr = data.update_time || '';
            const pointCount = data.times ? data.times.length : 0;
            const sourceTag = data.source === 'eastmoney' ? ' [东方财富API]' : ' [本地数据]';
            document.getElementById('updateTime').textContent =
                `分时图 | ${data.date || ''} | ${pointCount}个采样点 | ${timeStr}${sourceTag}`;
            updateIntradaySummary(data);
        }
        return data;
    }

    /**
     * 加载实时排名数据（柱状图/热力图/桑基图/表格）
     * 今日：优先东方财富API，fallback本地JSON
     * 历史日期：从分时数据文件提取最终值作为该日期的排名数据
     * "全部"模式下分别获取行业和概念数据后合并
     */
    async function loadRealtimeData(chartDom, sectorType, indicator, chartType) {
        const selectedDate = document.getElementById('intradayDate').value || new Date().toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const isToday = selectedDate === today;

        // "全部"模式：分别获取行业和概念数据后合并
        if (sectorType === 'all') {
            const [industryData, conceptData] = await Promise.all([
                loadRealtimeDataSingle('industry', indicator, isToday),
                loadRealtimeDataSingle('concept', indicator, isToday)
            ]);
            const data = mergeIndustryConceptData(industryData, conceptData);
            if (!data) throw new Error('行业和概念数据均不可用');
            const filteredData = filterDataBySectors(data);
            renderChart(chartDom, filteredData, chartType);
            updateSummary(filteredData);
            return;
        }
        const data = await loadRealtimeDataSingle(sectorType, indicator, isToday);
        if (!data) throw new Error('数据加载失败');
        const filteredData = filterDataBySectors(data);
        renderChart(chartDom, filteredData, chartType);
        updateSummary(filteredData);
    }

    /**
     * 加载单个板块类型的实时排名数据
     * @param {string} sectorType - 板块类型
     * @param {string} indicator - 时间指标
     * @param {boolean} isToday - 是否为今天
     * @returns {Promise<Object|null>}
     */
    async function loadRealtimeDataSingle(sectorType, indicator, isToday) {
        let data = null;

        // 今日数据优先使用东方财富API
        if (isToday && indicator === '今日') {
            try {
                const selectedNames = getFilterParam();
                data = await EastMoneyAPI.buildRealtimeData(sectorType, selectedNames);
                if (data) {
                    console.log(`实时数据来源(${sectorType}): 东方财富API`);
                }
            } catch (err) {
                console.warn(`东方财富API获取${sectorType}实时数据失败，尝试本地JSON:`, err);
            }
        }

        // Fallback: 本地JSON数据
        if (!data) {
            try {
                if (isToday) {
                    // 今天：读取实时/一周数据文件
                    let filename;
                    if (indicator === '一周') {
                        const today = new Date().toISOString().slice(0, 10);
                        filename = `weekly_${sectorType}_${today}.json`;
                    } else {
                        filename = `realtime_${sectorType}_${indicator}.json`;
                    }
                    data = await fetchJSON(CONFIG.dataPath + filename);
                    console.log(`实时数据来源(${sectorType}): 本地JSON`);
                } else {
                    // 历史日期：从分时数据文件提取最终值作为该日期的排名数据
                    const selectedDate = document.getElementById('intradayDate').value;
                    const filename = `intraday_${sectorType}_${selectedDate}.json`;
                    const intradayData = await fetchJSON(CONFIG.dataPath + filename);
                    data = convertIntradayToRealtime(intradayData, selectedDate);
                    console.log(`实时数据来源(${sectorType}): 本地分时JSON (${selectedDate})`);
                }
            } catch (err) {
                console.warn(`本地数据加载失败(${sectorType}):`, err.message);
                return null;
            }
        }
        return data;
    }

    /**
     * 将分时数据转换为实时排名数据格式
     * 提取每个板块的final_value作为净流入，并构建sectors数组
     * @param {Object} intradayData - 分时数据
     * @param {string} date - 日期
     * @returns {Object} 实时排名格式数据
     */
    function convertIntradayToRealtime(intradayData, date) {
        const sectors = (intradayData.sectors || []).map(s => ({
            name: s.name,
            main_net_inflow: s.final_value || 0,
            change_percent: s.change_percent || 0,
            turnover: s.turnover || 0,
            main_net_inflow_pct: s.turnover ? ((s.final_value || 0) / s.turnover * 100) : 0
        }));
        return {
            update_time: intradayData.update_time || '',
            date: date,
            indicator: '今日',
            sector_type: intradayData.sector_type || '',
            sectors: sectors,
            source: 'intraday_convert'
        };
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
     * "全部"模式下合并行业和概念数据
     */
    async function loadBarRaceData(chartDom, sectorType) {
        try {
            if (sectorType === 'all') {
                const [industryData, conceptData] = await Promise.all([
                    fetchJSON(CONFIG.dataPath + 'bar_race_industry.json').catch(() => null),
                    fetchJSON(CONFIG.dataPath + 'bar_race_concept.json').catch(() => null)
                ]);
                const data = mergeIndustryConceptData(industryData, conceptData);
                if (!data) throw new Error('无数据');
                currentChart = ChartRender.renderBarRace(chartDom, data);
                document.getElementById('updateTime').textContent =
                    `动态排行 | 共${data.dates ? data.dates.length : 0}天数据 | 点击暂停/播放`;
            } else {
                const filename = `bar_race_${sectorType}.json`;
                const data = await fetchJSON(CONFIG.dataPath + filename);
                currentChart = ChartRender.renderBarRace(chartDom, data);
                document.getElementById('updateTime').textContent =
                    `动态排行 | 共${data.dates ? data.dates.length : 0}天数据 | 点击暂停/播放`;
            }
        } catch (err) {
            chartDom.innerHTML = '<div style="text-align:center;padding:100px;color:#8b949e;">' +
                '<h2>暂无Bar Race数据</h2>' +
                '<p>需要积累多日快照数据后才能展示动态排行</p>' +
                '<p style="font-size:12px;margin-top:10px;">请先运行定时采集积累历史数据</p></div>';
        }
    }

    /**
     * 根据数据量自适应图表容器高度
     * 柱状图/桑基图：每个板块约28px + 标题和边距
     * 热力图/分时图：使用默认高度
     */
    function adjustChartHeight(chartDom, data, chartType) {
        const sectorCount = (data.sectors || []).length;
        let height;

        if (chartType === 'bar' || chartType === 'sankey') {
            // 横向柱状图：每个板块需要约28px高度，加上标题和边距
            height = Math.max(400, sectorCount * 28 + 80);
        } else if (chartType === 'heatmap') {
            // 热力图：根据板块数量计算网格
            const cols = Math.ceil(Math.sqrt(sectorCount));
            const rows = Math.ceil(sectorCount / cols);
            height = Math.max(400, rows * 70 + 80);
        } else if (chartType === 'table') {
            // 表格：每行约32px + 表头40px + 标题30px + 边距
            height = Math.max(400, sectorCount * 32 + 120);
        } else {
            // 分时图等：默认高度（调高20%）
            height = 720;
        }

        chartDom.style.height = height + 'px';
    }

    /**
     * 渲染图表
     */
    function renderChart(chartDom, data, chartType) {
        // 自适应高度
        adjustChartHeight(chartDom, data, chartType);

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
            case 'table':
                currentChart = ChartRender.renderTable(chartDom, data);
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
