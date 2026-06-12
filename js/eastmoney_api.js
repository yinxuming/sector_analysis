/**
 * 东方财富API数据源模块
 * 通过JSONP方式调用东方财富公开接口，获取板块分时资金流数据
 * 解决GitHub Pages部署时无法后端采集分时数据的问题
 *
 * 接口说明：
 * - 板块列表：push2.eastmoney.com/api/qt/clist/get (fs=m:90+t:2 行业, fs=m:90+t:3 概念)
 * - 分时资金流：push2.eastmoney.com/api/qt/stock/fflow/kline/get (secid=90.BKxxxx, klt=1)
 * - 分时价格：push2his.eastmoney.com/api/qt/stock/trends2/get (secid=90.BKxxxx)
 */

const EastMoneyAPI = {

    // 板块类型映射：fs参数
    SECTOR_FS_MAP: {
        industry: 'm:90+t:2',   // 行业板块
        concept: 'm:90+t:3'     // 概念板块
    },

    // 板块名称到代码的缓存映射
    _sectorCodeMap: {
        industry: null,
        concept: null
    },

    // JSONP回调计数器
    _jsonpCounter: 0,

    /**
     * JSONP请求封装
     * @param {string} url - 请求URL（不含callback参数）
     * @param {number} timeout - 超时时间(ms)
     * @returns {Promise<object>} 响应数据
     */
    _jsonp(url, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const callbackName = `em_callback_${++this._jsonpCounter}_${Date.now()}`;
            const script = document.createElement('script');
            let timer = null;

            // 清理函数
            const cleanup = () => {
                if (timer) clearTimeout(timer);
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
            };

            // 回调函数
            window[callbackName] = (data) => {
                cleanup();
                resolve(data);
            };

            // 超时处理
            timer = setTimeout(() => {
                cleanup();
                reject(new Error('JSONP request timeout'));
            }, timeout);

            // 添加callback参数
            const separator = url.includes('?') ? '&' : '?';
            script.src = `${url}${separator}cb=${callbackName}`;
            script.onerror = () => {
                cleanup();
                reject(new Error('JSONP script load error'));
            };

            document.head.appendChild(script);
        });
    },

    /**
     * 获取板块列表（含代码映射）
     * @param {string} sectorType - 板块类型 industry/concept
     * @returns {Promise<Array>} 板块列表 [{code, name, mainNetInflow, changePct, ...}]
     */
    async fetchSectorList(sectorType = 'industry') {
        const fs = this.SECTOR_FS_MAP[sectorType] || this.SECTOR_FS_MAP.industry;
        const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=500&po=1&np=1&fltt=2&invt=2&fid=f62&fs=${fs}&fields=f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87&ut=fa5fd1943c7b386f172d6893dbfba10b`;

        try {
            const resp = await this._jsonp(url);
            if (!resp || !resp.data || !resp.data.diff) {
                console.warn('东方财富板块列表返回为空');
                return [];
            }

            // 构建名称到代码的映射缓存
            const codeMap = {};
            const sectors = resp.data.diff.map(item => {
                const name = item.f14;  // 板块名称
                const code = item.f12;  // 板块代码（如BK0478）
                codeMap[name] = code;

                return {
                    code: code,
                    name: name,
                    price: item.f2,          // 指数点位
                    changePct: item.f3,      // 涨跌幅%
                    mainNetInflow: item.f62, // 主力净流入（元）
                    mainNetInflowYi: +(item.f62 / 1e8).toFixed(2), // 亿元
                    hugeNetInflow: item.f66, // 超大单净流入
                    hugeNetInflowPct: item.f69,
                    bigNetInflow: item.f72,  // 大单净流入
                    bigNetInflowPct: item.f75,
                    mediumNetInflow: item.f78, // 中单净流入
                    mediumNetInflowPct: item.f81,
                    smallNetInflow: item.f84,  // 小单净流入
                    smallNetInflowPct: item.f87,
                    mainNetInflowPct: item.f184  // 主力净流入占比
                };
            });

            // 缓存映射
            this._sectorCodeMap[sectorType] = codeMap;

            return sectors;
        } catch (err) {
            console.error('获取板块列表失败:', err);
            return [];
        }
    },

    /**
     * 获取板块分时资金流数据（分钟级）
     * @param {string} sectorCode - 板块代码（如BK0478）
     * @param {number} limit - 返回数据条数
     * @returns {Promise<Array>} 分时资金流 [{time, mainInflow, hugeInflow, bigInflow, mediumInflow, smallInflow}]
     */
    async fetchSectorFlowMinute(sectorCode, limit = 240) {
        const secid = `90.${sectorCode}`;
        const url = `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?fields1=f1,f2,f3,f4,f5&fields2=f51,f52,f53,f54,f55,f56,f57&secid=${secid}&klt=1&lmt=${limit}&ut=fa5fd1943c7b386f172d6893dbfba10b`;

        try {
            const resp = await this._jsonp(url);
            if (!resp || !resp.data || !resp.data.klines) {
                return [];
            }

            // 解析klines: "2026-06-12 14:51,419255199.0,-214277921.0,-200206777.0,248181948.0,171073251.0"
            // 字段: 时间,主力净流入,超大单净流入,大单净流入,中单净流入,小单净流入
            return resp.data.klines.map(line => {
                const parts = line.split(',');
                return {
                    time: parts[0],                              // "2026-06-12 14:51"
                    timeShort: parts[0].split(' ')[1] || parts[0], // "14:51"
                    mainInflow: +parts[1],                       // 主力净流入（元）
                    mainInflowYi: +(parts[1] / 1e8).toFixed(4),  // 亿元
                    hugeInflow: +parts[2],                       // 超大单净流入
                    bigInflow: +parts[3],                        // 大单净流入
                    mediumInflow: +parts[4],                     // 中单净流入
                    smallInflow: +parts[5],                      // 小单净流入
                };
            });
        } catch (err) {
            console.error(`获取板块${sectorCode}分时资金流失败:`, err);
            return [];
        }
    },

    /**
     * 批量获取多个板块的分时资金流数据
     * @param {Array<string>} sectorCodes - 板块代码列表
     * @param {number} limit - 每个板块返回数据条数
     * @param {number} concurrency - 并发请求数
     * @returns {Promise<Object>} {code: [flowData]}
     */
    async fetchBatchSectorFlow(sectorCodes, limit = 240, concurrency = 3) {
        const results = {};
        const queue = [...sectorCodes];

        async function processNext(api) {
            while (queue.length > 0) {
                const code = queue.shift();
                try {
                    results[code] = await api.fetchSectorFlowMinute(code, limit);
                } catch (err) {
                    results[code] = [];
                }
            }
        }

        // 控制并发数
        const workers = [];
        for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
            workers.push(processNext(this));
        }
        await Promise.all(workers);

        return results;
    },

    /**
     * 获取板块名称对应的代码
     * @param {string} sectorName - 板块名称
     * @param {string} sectorType - 板块类型
     * @returns {Promise<string|null>} 板块代码（如BK0478）
     */
    async getSectorCode(sectorName, sectorType = 'industry') {
        // 检查缓存
        if (this._sectorCodeMap[sectorType] && this._sectorCodeMap[sectorType][sectorName]) {
            return this._sectorCodeMap[sectorType][sectorName];
        }

        // 重新获取板块列表
        await this.fetchSectorList(sectorType);

        return this._sectorCodeMap[sectorType]?.[sectorName] || null;
    },

    /**
     * 构建与本地JSON数据格式兼容的分时图数据
     * 从东方财富API获取数据，转换为前端分时图组件所需格式
     * @param {string} sectorType - 板块类型
     * @param {number} topN - 取前N个板块
     * @returns {Promise<Object>} 分时图数据
     */
    async buildIntradayData(sectorType = 'industry', topN = 30) {
        // 1. 获取板块列表（含代码映射和当日资金流排名）
        const sectors = await this.fetchSectorList(sectorType);
        if (sectors.length === 0) return null;

        // 按主力净流入绝对值排序取topN
        const displaySectors = sectors.slice(0, topN);

        // 2. 批量获取分时资金流
        const codes = displaySectors.map(s => s.code);
        const flowData = await this.fetchBatchSectorFlow(codes, 240, 3);

        // 3. 构建时间轴（取第一个有数据的板块的时间序列）
        let times = [];
        for (const code of codes) {
            const flows = flowData[code] || [];
            if (flows.length > 0) {
                times = flows.map(f => f.timeShort);
                break;
            }
        }

        if (times.length === 0) return null;

        // 4. 构建每个板块的分时数据（累计主力净流入）
        const sectorsData = displaySectors.map(sector => {
            const flows = flowData[sector.code] || [];
            // 东方财富返回的是每分钟的净流入值（非累计），需要累加
            let cumulative = 0;
            const data = times.map((t, idx) => {
                const flow = flows.find(f => f.timeShort === t);
                if (flow) {
                    cumulative += flow.mainInflowYi;
                }
                return +cumulative.toFixed(4);
            });

            const finalValue = data.length > 0 ? data[data.length - 1] : 0;

            return {
                name: sector.name,
                data: data,
                final_value: +finalValue.toFixed(2)
            };
        });

        // 按最终值降序排列
        sectorsData.sort((a, b) => b.final_value - a.final_value);

        // 5. 构建兼容格式
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10);

        return {
            update_time: today.toLocaleString('zh-CN'),
            date: dateStr,
            indicator: '今日',
            sector_type: sectorType === 'industry' ? '行业资金流' : '概念资金流',
            times: times,
            sectors: sectorsData,
            source: 'eastmoney'  // 标记数据来源
        };
    },

    /**
     * 构建与本地JSON数据格式兼容的实时排名数据
     * @param {string} sectorType - 板块类型
     * @returns {Promise<Object>} 实时排名数据
     */
    async buildRealtimeData(sectorType = 'industry') {
        const sectors = await this.fetchSectorList(sectorType);
        if (sectors.length === 0) return null;

        const today = new Date();

        return {
            update_time: today.toLocaleString('zh-CN'),
            indicator: '今日',
            sector_type: sectorType === 'industry' ? '行业资金流' : '概念资金流',
            sectors: sectors.map(s => ({
                name: s.name,
                main_net_inflow_yi: s.mainNetInflowYi,
                huge_net_inflow_yi: +(s.hugeNetInflow / 1e8).toFixed(2),
                big_net_inflow_yi: +(s.bigNetInflow / 1e8).toFixed(2),
                medium_net_inflow_yi: +(s.mediumNetInflow / 1e8).toFixed(2),
                small_net_inflow_yi: +(s.smallNetInflow / 1e8).toFixed(2),
                main_net_inflow_pct: s.mainNetInflowPct,
                change_pct: s.changePct
            })),
            source: 'eastmoney'
        };
    }
};
