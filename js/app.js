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
        // 初始化日期选择器：动态排行不需要，其他图表都显示
        const chartType = document.getElementById('chartType').value;
        const isBarRace = chartType === 'barRace';
        document.getElementById('dateGroup').style.display = isBarRace ? 'none' : 'inline-flex';
        const isIntraday = chartType === 'intraday';
        document.getElementById('intradayFullGroup').style.display = isIntraday ? 'inline-flex' : 'none';
        if (!isBarRace && !document.getElementById('intradayDate').value) {
            document.getElementById('intradayDate').value = new Date().toISOString().slice(0, 10);
        }
        // 先加载板块列表，完成后再加载数据（确保板块过滤生效）
        loadSectorList().then(() => loadData());
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
            // 动态排行不需要日期选择器（需要多日数据），其他图表都显示
            const isBarRace = this.value === 'barRace';
            document.getElementById('dateGroup').style.display = isBarRace ? 'none' : 'inline-flex';
            // 获取完整分时按钮仅分时图显示
            const isIntraday = this.value === 'intraday';
            document.getElementById('intradayFullGroup').style.display = isIntraday ? 'inline-flex' : 'none';
            // 切换图表时，默认日期为今天
            if (!isBarRace && !document.getElementById('intradayDate').value) {
                document.getElementById('intradayDate').value = new Date().toISOString().slice(0, 10);
            }
            // 时间指标在动态排行模式下隐藏（不需要）
            document.getElementById('indicator').parentElement.style.display = isBarRace ? 'none' : 'inline-flex';
            loadData();
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
        });
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
        document.getElementById('btnExport').addEventListener('click', exportSelectedSectors);
        document.getElementById('btnImport').addEventListener('click', importSelectedSectors);
        document.getElementById('importFile').addEventListener('change', handleImportFile);
        document.getElementById('sectorSearch').addEventListener('input', filterSectors);
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

    /**
     * 加载数据并渲染图表
     * 优先使用东方财富API获取实时数据，本地JSON作为fallback
     * "全部"模式下分别获取行业和概念数据后合并
     */
    async function loadData() {
        const sectorType = getTypeKey();
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
     * @returns {Promise<Object|null>} 分时数据对象，失败返回null
     */
    async function loadIntradayDataSingle(chartDom, sectorType) {
        let data = null;
        const selectedDate = document.getElementById('intradayDate').value || new Date().toISOString().slice(0, 10);
        const today = new Date().toISOString().slice(0, 10);
        const isToday = selectedDate === today;

        // 今天的数据：优先尝试东方财富API（实时分钟级数据）
        if (isToday) {
            try {
                const topN = getTopNValue() === -1 ? 500 : (getTopNValue() || 30);
                const selectedNames = getFilterParam();
                data = await EastMoneyAPI.buildIntradayData(sectorType, topN, selectedNames);
                if (data) {
                    console.log(`分时图数据来源(${sectorType}): 东方财富API`);
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
            // 分时图等：默认高度
            height = 600;
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
