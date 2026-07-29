import React from 'react';
import {
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Legend
} from 'recharts';
import { Icons } from './Icons';
import { Portal } from './UI_Lib';

const CountUp = ({ end, duration = 1500 }) => {
    const [count, setCount] = React.useState(0);
    React.useEffect(() => {
        let startTime = null;
        let animationFrame;
        const step = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            setCount(Math.floor(ease * end));
            if (progress < 1) animationFrame = window.requestAnimationFrame(step);
        };
        animationFrame = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(animationFrame);
    }, [end, duration]);
    return <>{count.toLocaleString()}</>;
};

const EMPTY_BUCKET = { total: 0, byStatus: {}, byPlatform: {}, byCommission: {}, byShipped: {}, byClip: {} };

const getBucketForTimeframe = (s, timeFrame, customDateRange) => {
    if (!s) return EMPTY_BUCKET;
    if (['all', 'today', 'week', 'month'].includes(timeFrame)) return s[timeFrame] || EMPTY_BUCKET;
    if (timeFrame === 'custom') {
        const curr = { total: 0, byStatus: {}, byPlatform: {}, byCommission: {}, byShipped: {}, byClip: {} };
        const { start, end } = customDateRange;
        if (start && end && s.daily) {
            const startDate = new Date(start); startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(end); endDate.setHours(23, 59, 59, 999);
            Object.entries(s.daily).forEach(([dateStr, dailyStats]) => {
                const d = new Date(dateStr); d.setHours(12, 0, 0, 0);
                if (d >= startDate && d <= endDate) {
                    curr.total += dailyStats.total;
                    ['byStatus', 'byPlatform', 'byCommission', 'byShipped', 'byClip'].forEach(prop => {
                        Object.entries(dailyStats[prop] || {}).forEach(([k, v]) => { curr[prop][k] = (curr[prop][k] || 0) + v; });
                    });
                }
            });
        }
        return curr;
    }
    return s.history?.[timeFrame] || EMPTY_BUCKET;
};

const computeKpiFromBucket = (bucket) => {
    let replied = 0, count_active_accepted = 0, count_accepted_pending_request = 0, count_pending = 0,
        count_rejected_ratecard = 0, count_rejected_pure = 0, count_ghosted = 0, count_no_status = 0, count_deal_closed = 0;
    Object.entries(bucket.byStatus || {}).forEach(([k, count]) => {
        const str = String(k).trim();
        if (!str || str === "-" || str.toLowerCase() === "unknown") { count_no_status += count; return; }
        if (str.includes("ดีลจบ")) { count_deal_closed += count; replied += count; return; }
        if (str.includes("รับข้อเสนอ")) {
            if (str.includes("ไม่รับ")) { count_rejected_pure += count; replied += count; }
            else if (str.includes("ยังไม่กดขอ")) { count_accepted_pending_request += count; replied += count; }
            else { count_active_accepted += count; replied += count; }
        }
        else if (str.includes("กำลังตัดสินใจ") || str.includes("สนใจ")) { count_pending += count; replied += count; }
        else if (str.includes("เรทการ์ด")) { count_rejected_ratecard += count; replied += count; }
        else if (str.includes("ปฏิเสธ")) { count_rejected_pure += count; replied += count; }
        else if (str.includes("ไม่อ่าน") || str.includes("อ่าน แต่ไม่ตอบ") || str.includes("ไม่ตอบ")) { count_ghosted += count; }
    });
    let count_shipped = 0, count_clip_posted = 0;
    Object.entries(bucket.byShipped || {}).forEach(([k, count]) => { if (String(k).includes("ส่งแล้ว")) count_shipped += count; });
    Object.entries(bucket.byClip || {}).forEach(([k, count]) => { if (String(k).includes("ลงแล้ว")) count_clip_posted += count; });
    const total = bucket.total || 0;
    const totalAccepted = count_active_accepted + count_accepted_pending_request + count_deal_closed;
    const responseRate = total > 0 ? ((replied / total) * 100).toFixed(1) : 0;
    const acceptanceRate = replied > 0 ? ((totalAccepted / replied) * 100).toFixed(1) : 0;
    const shippedRate = totalAccepted > 0 ? ((count_shipped / totalAccepted) * 100).toFixed(1) : 0;
    const clipRate = totalAccepted > 0 ? ((count_clip_posted / totalAccepted) * 100).toFixed(1) : 0;
    return {
        total, replied,
        accepted_pending_request: count_accepted_pending_request,
        active_accepted: count_active_accepted,
        deal_closed: count_deal_closed,
        total_accepted: totalAccepted,
        pending: count_pending, ghosted: count_ghosted, no_status: count_no_status,
        shipped: count_shipped, clip_posted: count_clip_posted,
        rates: { response: responseRate, acceptance: acceptanceRate, shipped: shippedRate, clip: clipRate }
    };
};

const DashboardFilterSelector = ({ filterType, filterValue, teams, members, onChange }) => {
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef(null);
    const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 300, maxHeight: 400 });

    const getLabel = () => {
        if (filterType === 'ALL') return 'ภาพรวมองค์กร';
        if (filterType === 'TEAM') return `ทีม: ${filterValue}`;
        return `สมาชิก: ${filterValue}`;
    };

    const toggle = (e) => {
        e.stopPropagation();
        if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom - 20;
            let maxHeight = 400;
            let top = rect.bottom + 8;
            if (spaceBelow < 400) maxHeight = Math.max(spaceBelow, 300);
            const isRightSide = rect.left > window.innerWidth / 2;
            let left = isRightSide ? 'auto' : rect.left;
            let right = isRightSide ? (window.innerWidth - rect.right) : 'auto';
            if (window.innerWidth < 640) { left = 16; right = 16; }
            setCoords({ top, left, right, maxHeight, width: window.innerWidth < 640 ? 'auto' : 320 });
        }
        setOpen(!open);
    };

    return (
        <>
            <div ref={triggerRef}>
                <button onClick={toggle} className="bg-white/90 backdrop-blur-md hover:bg-white text-slate-800 text-sm font-bold rounded-2xl px-5 py-3 flex items-center gap-3 transition-all shadow-lg shadow-pink-500/10 border border-white/50 active:scale-95 duration-200">
                    <Icons.Filter size={16} className="text-slate-500" />
                    <span className="min-w-[140px] text-left truncate max-w-[200px]">{getLabel()}</span>
                    <Icons.ChevronDown size={16} className={`text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
                </button>
            </div>
            {open && (
                <Portal>
                    <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
                    <div className="fixed z-[9999] bg-white rounded-[24px] shadow-2xl shadow-slate-200/50 border border-slate-100 py-2 overflow-hidden animate-enter flex flex-col" style={{ top: coords.top, left: coords.left, right: coords.right, maxHeight: coords.maxHeight, width: coords.width === 'auto' ? 'auto' : `${coords.width}px` }}>
                        <div className="overflow-y-auto custom-scrollbar flex-1">
                            <div className="px-5 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-sm border-b border-slate-50">เลือกมุมมอง</div>
                            <button onClick={() => { onChange('ALL', ''); setOpen(false); }} className={`w-full text-left px-5 py-3 text-sm flex items-center gap-3 hover:bg-slate-50 transition-colors border-l-4 ${filterType === 'ALL' ? 'border-slate-900 bg-slate-50 font-bold text-slate-900' : 'border-transparent text-slate-600'}`}><Icons.Layers size={16} /> <span>ภาพรวมองค์กร</span></button>
                            <div className="my-1 border-t border-slate-50"></div>
                            <div className="px-5 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-sm border-b border-slate-50">รายชื่อทีม</div>
                            {teams.map(team => (
                                <button key={team} onClick={() => { onChange('TEAM', team); setOpen(false); }} className={`w-full text-left px-5 py-3 text-sm flex items-center gap-3 hover:bg-slate-50 transition-colors border-l-4 ${filterType === 'TEAM' && filterValue === team ? 'border-[#215E61] bg-[#215E61]/10 font-bold text-[#215E61]' : 'border-transparent text-slate-600'}`}><Icons.Briefcase size={16} /> <span>{team}</span></button>
                            ))}
                            <div className="my-1 border-t border-slate-50"></div>
                            <div className="px-5 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white z-10 shadow-sm border-b border-slate-50">รายชื่อสมาชิก</div>
                            {members.map(m => (
                                <button key={m.name} onClick={() => { onChange('PERSON', m.name); setOpen(false); }} className={`w-full text-left px-5 py-3 text-sm flex items-center gap-3 hover:bg-slate-50 transition-colors border-l-4 ${filterType === 'PERSON' && filterValue === m.name ? 'border-pink-500 bg-pink-50 font-bold text-pink-900' : 'border-transparent text-slate-600'}`}><Icons.User size={16} /> <span>{m.label || m.name}</span></button>
                            ))}
                        </div>
                    </div>
                </Portal>
            )}
        </>
    );
};

export const Dashboard = ({ data, filterType, filterValue, onFilterChange, loading, allSheets, onDrillDown }) => {
    const [timeFrame, setTimeFrame] = React.useState('all');
    const [monthOpen, setMonthOpen] = React.useState(false);
    const [customDateRange, setCustomDateRange] = React.useState({ start: '', end: '' });
    const monthRef = React.useRef(null);

    const { kpi, rejectionStats, platformData, availableMonths, pipelineData } = React.useMemo(() => {
        const emptyStats = { all: EMPTY_BUCKET, today: EMPTY_BUCKET, week: EMPTY_BUCKET, month: EMPTY_BUCKET, history: {}, daily: {} };
        let s = data?.overall || emptyStats;
        if (data) {
            if (filterType === 'TEAM') s = data.byTeam?.[filterValue] || emptyStats;
            if (filterType === 'PERSON') s = data.bySheet?.[filterValue] || emptyStats;
        }
        const curr = getBucketForTimeframe(s, timeFrame, customDateRange);
        const months = s.history ? Object.keys(s.history).sort().reverse() : [];
        const k = computeKpiFromBucket(curr);
        const pData = Object.entries(curr.byPlatform || {}).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

        let count_pending = 0, count_rejected_ratecard = 0, count_rejected_pure = 0, count_ghosted = 0, count_no_status = 0;
        Object.entries(curr.byStatus || {}).forEach(([key, count]) => {
            const str = String(key).trim();
            if (!str || str === "-" || str.toLowerCase() === "unknown") { count_no_status += count; return; }
            if (str.includes("ดีลจบ") || str.includes("รับข้อเสนอ")) return;
            if (str.includes("กำลังตัดสินใจ") || str.includes("สนใจ")) count_pending += count;
            else if (str.includes("เรทการ์ด")) count_rejected_ratecard += count;
            else if (str.includes("ปฏิเสธ")) count_rejected_pure += count;
            else if (str.includes("ไม่อ่าน") || str.includes("อ่าน แต่ไม่ตอบ") || str.includes("ไม่ตอบ")) count_ghosted += count;
        });

        return {
            kpi: k,
            rejectionStats: [
                { name: 'ไม่มีสถานะ', value: count_no_status, fill: '#475569', filterKey: 'No Status' },
                { name: 'Ghosted (ไม่อ่าน/ไม่ตอบ)', value: count_ghosted, fill: '#cbd5e1', filterKey: 'Ghosted' },
                { name: 'ไม่รับข้อเสนอ', value: count_rejected_pure, fill: '#f43f5e', filterKey: 'ไม่รับข้อเสนอ' },
                { name: 'ไม่รับ / มีเรทการ์ด', value: count_rejected_ratecard, fill: '#f59e0b', filterKey: 'ไม่รับ / มีเรทการ์ด' },
                { name: 'กำลังตัดสินใจ', value: count_pending, fill: '#3b82f6', filterKey: 'Pending' },
                { name: 'รับข้อเสนอ (จบ)', value: k.active_accepted, fill: '#10b981', filterKey: 'รับข้อเสนอ' },
                { name: 'ดีลจบ (สำเร็จ)', value: k.deal_closed, fill: '#059669', filterKey: 'ดีลจบ' }
            ].filter(x => x.value > 0),
            pipelineData: [
                { name: 'รอขอสินค้า', value: k.accepted_pending_request, fill: '#06b6d4', filterKey: 'รับข้อเสนอแต่ยังไม่กดขอสินค้า' },
                { name: 'รับข้อเสนอแล้ว', value: k.active_accepted, fill: '#10b981', filterKey: 'รับข้อเสนอ' },
                { name: 'ดีลจบ', value: k.deal_closed, fill: '#059669', filterKey: 'ดีลจบ' }
            ],
            platformData: pData, availableMonths: months
        };
    }, [data, filterType, filterValue, timeFrame, customDateRange]);

    const leaderboard = React.useMemo(() => {
        if (!data?.bySheet || !allSheets) return [];
        return allSheets
            .filter(sh => sh.id !== 'ERROR')
            .map(sh => {
                const stats = data.bySheet[sh.name] || { all: EMPTY_BUCKET, today: EMPTY_BUCKET, week: EMPTY_BUCKET, month: EMPTY_BUCKET, history: {}, daily: {} };
                const bucket = getBucketForTimeframe(stats, timeFrame, customDateRange);
                return { name: sh.name, label: sh.label || sh.name, team: sh.source, ...computeKpiFromBucket(bucket) };
            })
            .filter(m => m.total > 0)
            .sort((a, b) => (b.deal_closed + b.active_accepted) - (a.deal_closed + a.active_accepted) || b.total - a.total);
    }, [data, allSheets, timeFrame, customDateRange]);

    const setRange = (days) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        const fmt = d => d.toISOString().split('T')[0];
        setCustomDateRange({ start: fmt(start), end: fmt(end) });
    };
    const handleCustomClick = () => {
        setTimeFrame('custom');
        if (!customDateRange.start) setRange(30);
    };

    if (loading) return <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-3"><Icons.Loader2 className="animate-spin w-8 h-8" /><p>กำลังโหลดข้อมูล...</p></div>;

    const timeFrameLabels = { today: "วันนี้", week: "สัปดาห์นี้", month: "เดือนนี้", all: "ทั้งหมด", custom: "กำหนดเอง" };
    const formatMonth = (ym) => {
        const [y, m] = ym.split('-');
        return new Date(y, m - 1).toLocaleString('th-TH', { month: 'long', year: 'numeric' });
    };
    const isMonthSelected = timeFrame.includes('-');

    return (
        <div className="space-y-6 pb-20 animate-enter">
            <div className="relative shadow-lg shadow-pink-200/50 rounded-[32px] group hover:scale-[1.005] transition-transform duration-500">
                <div className="absolute inset-0 bg-banner-gradient rounded-[32px] overflow-hidden">
                    <div className="hidden lg:block absolute right-10 bottom-[-20px] opacity-90 pointer-events-none" style={{ animation: 'float 6s ease-in-out infinite' }}>
                        <div className="w-48 h-48 bg-white/20 rounded-full blur-2xl absolute top-0 right-0"></div>
                        <Icons.Briefcase size={160} className="text-white/30" />
                    </div>
                </div>
                <div className="relative z-10 p-8 text-slate-800">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                        <div>
                            <h2 className="text-3xl md:text-4xl font-extrabold mb-2 text-slate-900 tracking-tight">แดชบอร์ดสรุปผล</h2>
                            <p className="text-slate-700 font-medium text-lg opacity-80 max-w-lg">ข้อมูลสำหรับ <span className="font-bold underline decoration-2 decoration-white/50">{filterType === 'ALL' ? 'องค์กรภาพรวม' : filterValue}</span></p>
                            <div className="mt-6 flex flex-wrap gap-3 items-center">
                                <div className="bg-white/40 backdrop-blur-md px-4 py-2 rounded-2xl text-sm font-bold text-slate-900 shadow-sm border border-white/20">📅 {new Date().toLocaleDateString('th-TH')}</div>
                                <DashboardFilterSelector filterType={filterType} filterValue={filterValue} teams={Array.from(new Set(allSheets.map(s => s.source)))} members={allSheets} onChange={onFilterChange} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                    <div className="flex gap-2 bg-white/50 p-1.5 rounded-2xl w-fit backdrop-blur-sm border border-slate-100/50 overflow-x-auto no-scrollbar max-w-full shadow-sm">
                        {['today', 'week', 'month', 'all'].map(tf => (
                            <button key={tf} onClick={() => setTimeFrame(tf)} className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap ${timeFrame === tf ? 'bg-[#215E61] text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-white'}`}>{timeFrameLabels[tf]}</button>
                        ))}
                        <button onClick={handleCustomClick} className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase transition-all whitespace-nowrap ${timeFrame === 'custom' ? 'bg-[#215E61] text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-white'}`}>กำหนดเอง</button>
                    </div>

                    {availableMonths.length > 0 && timeFrame !== 'custom' && (
                        <div className="relative" ref={monthRef}>
                            <button onClick={() => setMonthOpen(!monthOpen)} className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl border transition-all shadow-sm w-full sm:w-auto ${isMonthSelected ? 'bg-pink-50 border-pink-300 ring-2 ring-pink-100/50' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                <div className={`p-1 rounded-lg ${isMonthSelected ? 'bg-pink-100 text-pink-600' : 'bg-slate-100 text-slate-400'}`}><Icons.CalendarDays size={16} /></div>
                                <div className="flex flex-col leading-none text-left">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${isMonthSelected ? 'text-pink-400' : 'text-slate-400'}`}>ประวัติ</span>
                                    <span className={`text-sm font-bold whitespace-nowrap min-w-[100px] ${isMonthSelected ? 'text-pink-700' : 'text-slate-600'}`}>{isMonthSelected ? formatMonth(timeFrame) : "เลือกเดือน..."}</span>
                                </div>
                                <Icons.ChevronDown size={16} className={`ml-3 transition-transform duration-200 ${monthOpen ? 'rotate-180' : ''} ${isMonthSelected ? 'text-pink-400' : 'text-slate-300'}`} />
                            </button>
                            {monthOpen && (
                                <Portal>
                                    <div className="fixed inset-0 z-[9998]" onClick={() => setMonthOpen(false)} />
                                    <div className="fixed z-[9999] bg-white rounded-[24px] shadow-2xl shadow-slate-200/50 border border-slate-100 py-2 overflow-hidden animate-enter flex flex-col min-w-[240px]" style={{ top: monthRef.current ? monthRef.current.getBoundingClientRect().bottom + 8 : 0, left: monthRef.current ? monthRef.current.getBoundingClientRect().left : 0, maxHeight: '320px' }}>
                                        <div className="px-5 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-white z-10 border-b border-slate-50 mb-1">เดือนที่มีข้อมูล</div>
                                        <div className="overflow-y-auto custom-scrollbar p-2 space-y-1">
                                            {availableMonths.map(m => (
                                                <button key={m} onClick={() => { setTimeFrame(m); setMonthOpen(false); }} className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-between transition-all group ${timeFrame === m ? 'bg-pink-50 text-pink-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                                                    <span className="flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${timeFrame === m ? 'bg-pink-200/50' : 'bg-slate-100 group-hover:bg-white'}`}><Icons.Calendar size={14} className={timeFrame === m ? 'text-pink-600' : 'text-slate-400'} /></div>{formatMonth(m)}</span>
                                                    {timeFrame === m && <Icons.Check size={16} className="text-pink-500" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </Portal>
                            )}
                        </div>
                    )}
                </div>

                {timeFrame === 'custom' && (
                    <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl shadow-sm border border-slate-100 w-fit animate-enter">
                        <div className="flex items-center gap-2 px-2"><Icons.Calendar size={16} className="text-slate-400" /><span className="text-xs font-bold text-slate-500 uppercase">ช่วงเวลา:</span></div>
                        <input type="date" value={customDateRange.start} onChange={e => setCustomDateRange({ ...customDateRange, start: e.target.value })} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-pink-200 outline-none hover:bg-slate-100 transition-colors cursor-pointer" />
                        <span className="text-slate-400 font-bold">-</span>
                        <input type="date" value={customDateRange.end} onChange={e => setCustomDateRange({ ...customDateRange, end: e.target.value })} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-pink-200 outline-none hover:bg-slate-100 transition-colors cursor-pointer" />
                        <div className="w-px h-6 bg-slate-200 mx-1"></div>
                        <button onClick={() => setRange(7)} className="px-3 py-2 rounded-xl bg-pink-50 text-pink-600 text-xs font-bold hover:bg-pink-100 transition-colors flex items-center gap-1">7 วันล่าสุด</button>
                        <button onClick={() => setRange(30)} className="px-3 py-2 rounded-xl bg-slate-50 text-slate-600 text-xs font-bold hover:bg-slate-100 transition-colors flex items-center gap-1">30 วัน</button>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div onClick={() => onDrillDown('ALL')} className="bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 hover:-translate-y-1 hover:shadow-lg transition-all cursor-pointer group active:scale-95">
                    <div className="flex justify-between items-start mb-4"><div className="p-3 bg-[#215E61]/10 rounded-2xl text-[#215E61] group-hover:bg-[#215E61]/18 transition-colors"><Icons.Users size={24} /></div><div className="text-right"><h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">รายชื่อทั้งหมด</h3><div className="text-2xl font-extrabold text-slate-900"><CountUp end={kpi.total} /></div></div></div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-[#215E61] w-full"></div></div><div className="text-[10px] text-slate-400 mt-2 font-medium text-right group-hover:text-white transition-colors">คลิกเพื่อดูทั้งหมด</div>
                </div>
                <div onClick={() => onDrillDown('Replied')} className="bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 hover:-translate-y-1 hover:shadow-lg transition-all cursor-pointer group active:scale-95">
                    <div className="flex justify-between items-start mb-4"><div className="p-3 bg-[#215E61]/10 rounded-2xl text-[#215E61] group-hover:bg-[#215E61]/18 transition-colors"><Icons.MoreHorizontal size={24} /></div><div className="text-right"><h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">ตอบกลับแล้ว</h3><div className="text-2xl font-extrabold text-slate-900"><CountUp end={kpi.replied} /></div></div></div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-[#215E61] transition-all duration-1000" style={{ width: `${kpi.rates.response}%` }}></div></div><div className="flex justify-between mt-2 text-[10px] font-bold"><span className="text-slate-400 group-hover:text-white transition-colors">อัตราการตอบกลับ</span><span className="text-white">{kpi.rates.response}%</span></div>
                </div>
                <div onClick={() => onDrillDown('รับข้อเสนอ')} className="bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 hover:-translate-y-1 hover:shadow-lg transition-all cursor-pointer group active:scale-95">
                    <div className="flex justify-between items-start mb-4"><div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:bg-emerald-100 transition-colors"><Icons.CheckCircle2 size={24} /></div><div className="text-right"><h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">รับข้อเสนอ (รวม)</h3><div className="text-2xl font-extrabold text-slate-900"><CountUp end={kpi.total_accepted} /></div></div></div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${kpi.rates.acceptance}%` }}></div></div><div className="flex justify-between mt-2 text-[10px] font-bold"><span className="text-slate-400 group-hover:text-emerald-500 transition-colors">อัตราการรับงาน</span><span className="text-emerald-600">{kpi.rates.acceptance}%</span></div>
                </div>
                <div onClick={() => onDrillDown('รับข้อเสนอแต่ยังไม่กดขอสินค้า')} className={`p-5 rounded-[24px] shadow-sm border border-cyan-200 hover:-translate-y-1 hover:shadow-xl transition-all cursor-pointer group active:scale-95 ${kpi.accepted_pending_request > 0 ? 'bg-cyan-50 shadow-cyan-100' : 'bg-white'}`}>
                    <div className="flex justify-between items-start mb-4"><div className="p-3 bg-white rounded-2xl text-cyan-600 group-hover:text-cyan-700 transition-colors shadow-sm"><Icons.Target size={24} /></div><div className="text-right"><h3 className="text-cyan-600 font-bold text-[10px] uppercase tracking-wider">รอขอสินค้า (Action)</h3><div className="text-2xl font-extrabold text-cyan-700"><CountUp end={kpi.accepted_pending_request} /></div></div></div>
                    <div className="w-full bg-cyan-200 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-cyan-500 w-full animate-pulse"></div></div><div className="text-[10px] text-cyan-600 mt-2 font-bold text-right group-hover:underline transition-colors">คลิกเพื่อติดตามด่วน!</div>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 hover:-translate-y-1 hover:shadow-lg transition-all group">
                    <div className="flex justify-between items-start mb-4"><div className="p-3 bg-violet-50 rounded-2xl text-violet-600 group-hover:bg-violet-100 transition-colors"><Icons.Package size={24} /></div><div className="text-right"><h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">ส่งของถึงยัง</h3><div className="text-2xl font-extrabold text-slate-900"><CountUp end={kpi.shipped} /> <span className="text-sm text-slate-300 font-bold">/ {kpi.total_accepted}</span></div></div></div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-violet-500 transition-all duration-1000" style={{ width: `${kpi.rates.shipped}%` }}></div></div><div className="flex justify-between mt-2 text-[10px] font-bold"><span className="text-slate-400">ส่งของแล้วกี่ % ของดีลที่รับ</span><span className="text-violet-600">{kpi.rates.shipped}%</span></div>
                </div>
                <div className="bg-white p-5 rounded-[24px] shadow-sm border border-slate-100 hover:-translate-y-1 hover:shadow-lg transition-all group">
                    <div className="flex justify-between items-start mb-4"><div className="p-3 bg-pink-50 rounded-2xl text-pink-600 group-hover:bg-pink-100 transition-colors"><Icons.Video size={24} /></div><div className="text-right"><h3 className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">ลงคลิปยัง</h3><div className="text-2xl font-extrabold text-slate-900"><CountUp end={kpi.clip_posted} /> <span className="text-sm text-slate-300 font-bold">/ {kpi.total_accepted}</span></div></div></div>
                    <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-pink-500 transition-all duration-1000" style={{ width: `${kpi.rates.clip}%` }}></div></div><div className="flex justify-between mt-2 text-[10px] font-bold"><span className="text-slate-400">ลงคลิปแล้วกี่ % ของดีลที่รับ</span><span className="text-pink-600">{kpi.rates.clip}%</span></div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col">
                    <div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-bold text-slate-800">ติดตามการขอสินค้า</h3><p className="text-xs text-slate-400 mt-1">เปรียบเทียบคนที่รับงานแล้ว VS ยังไม่กดขอ</p></div></div>
                    <div className="flex-1 min-h-[250px] relative">
                        {(pipelineData.reduce((acc, curr) => acc + curr.value, 0) > 0) ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pipelineData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onClick={(d) => onDrillDown(d.filterKey)} style={{ cursor: 'pointer' }}>{pipelineData.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />))}</Pie>
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} itemStyle={{ fontWeight: 600 }} />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : <div className="flex flex-col items-center justify-center h-full text-slate-300"><Icons.CheckCircle2 size={40} className="mb-2 opacity-50" /><span className="text-xs font-bold">ยังไม่มีข้อมูลการรับงาน</span></div>}
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none mt-[-20px]"><div className="text-3xl font-extrabold text-slate-800"><CountUp end={kpi.total_accepted} /></div><div className="text-[10px] font-bold text-slate-400 uppercase">Total Accepted</div></div>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 flex flex-col lg:col-span-2">
                    <div className="flex justify-between items-center mb-6"><div><h3 className="text-lg font-bold text-slate-800">การกระจายสถานะ (ทั้งหมด)</h3><p className="text-xs text-slate-400 mt-1">คลิกที่แท่งกราฟเพื่อดูรายชื่อกลุ่มนั้นๆ</p></div></div>
                    <div className="flex-1 min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={rejectionStats} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }} barSize={32} onClick={(d) => { if (d && d.activePayload && d.activePayload[0]) { onDrillDown(d.activePayload[0].payload.filterKey); } }} style={{ cursor: 'pointer' }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(29,33,40,0.12)" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 600, fill: '#3d434d' }} width={140} />
                                <Tooltip cursor={{ fill: 'rgba(29,33,40,0.06)' }} contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.25)', background: '#1D2128', color: '#F4F2F2' }} itemStyle={{ color: '#F4F2F2' }} labelStyle={{ color: '#adb3bb' }} />
                                <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={true}>{rejectionStats.map((entry, index) => (<Cell key={`cell-${index}`} fill={entry.fill} />))}<LabelList dataKey="value" position="right" style={{ fill: '#3d434d', fontSize: '12px', fontWeight: 'bold' }} /></Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100">
                <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Icons.Trophy size={20} className="text-amber-500" /> เปรียบเทียบผลงานรายบุคคล</h3>
                        <p className="text-xs text-slate-400 mt-1">ช่วงเวลา: <span className="font-bold text-slate-500">{isMonthSelected ? formatMonth(timeFrame) : (timeFrameLabels[timeFrame] || timeFrame)}</span> — คลิกชื่อเพื่อดูรายละเอียดรายบุคคล</p>
                    </div>
                </div>
                {leaderboard.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-300"><Icons.Users size={40} className="mb-2 opacity-50" /><span className="text-xs font-bold">ยังไม่มีข้อมูลในช่วงเวลานี้</span></div>
                ) : (
                    <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-sm min-w-[720px]">
                            <thead>
                                <tr className="text-[10px] text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100">
                                    <th className="px-2 py-2 text-left w-10">#</th>
                                    <th className="px-2 py-2 text-left">สมาชิก</th>
                                    <th className="px-2 py-2 text-right">รายชื่อทั้งหมด</th>
                                    <th className="px-2 py-2 text-right">ตอบกลับ %</th>
                                    <th className="px-2 py-2 text-right">รับข้อเสนอ</th>
                                    <th className="px-2 py-2 text-right">ดีลจบ</th>
                                    <th className="px-2 py-2 text-right">ส่งของแล้ว</th>
                                    <th className="px-2 py-2 text-right">ลงคลิปแล้ว</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leaderboard.map((m, i) => {
                                    const isActive = filterType === 'PERSON' && filterValue === m.name;
                                    const medal = i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-700' : 'text-slate-300';
                                    return (
                                        <tr key={m.name} onClick={() => onFilterChange('PERSON', m.name)} className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${isActive ? 'bg-pink-50/60' : 'hover:bg-slate-50'}`}>
                                            <td className="px-2 py-3 font-extrabold">{i < 3 ? <Icons.Trophy size={16} className={medal} /> : <span className="text-slate-300 text-xs pl-1">{i + 1}</span>}</td>
                                            <td className="px-2 py-3"><div className={`font-bold ${isActive ? 'text-pink-700' : 'text-slate-800'}`}>{m.label || m.name}</div><div className="text-[10px] text-slate-400 font-medium">{m.team}</div></td>
                                            <td className="px-2 py-3 text-right font-bold text-slate-700">{m.total}</td>
                                            <td className="px-2 py-3 text-right text-[#215E61] font-bold">{m.rates.response}%</td>
                                            <td className="px-2 py-3 text-right text-emerald-600 font-bold">{m.total_accepted}</td>
                                            <td className="px-2 py-3 text-right text-teal-700 font-bold">{m.deal_closed}</td>
                                            <td className="px-2 py-3 text-right text-violet-600 font-bold">{m.shipped}</td>
                                            <td className="px-2 py-3 text-right text-pink-600 font-bold">{m.clip_posted}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};
