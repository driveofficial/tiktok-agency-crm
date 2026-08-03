import React from 'react';
import { useDebounce } from '../hooks/useDebounce';
import { useStickyState } from '../hooks/useStickyState';
import { Icons } from './Icons';
import { Button, TeamSelector, SkeletonLoader } from './UI_Lib';
import { CRMTable, MobileCard, CreatorCard } from './Views';
import { EditModal, InfoModal, AlertModal, Toast } from './Modals';
// lazy: แยก Dashboard (+recharts ~500KB) ออกจาก chunk หลัก ให้ list view โหลดเร็ว
const Dashboard = React.lazy(() => import('./Dashboard').then(m => ({ default: m.Dashboard })));
import {
    COLUMN_CONFIG, getStatusColor, extractTiktokUsername, getDisplayName,
    getPipelineStage, getStageChipClasses, todayISO
} from '../lib/columns';
import {
    fetchSheetNames, fetchSheetData, fetchDashboardData, addRow, updateRow,
    deleteRow, insertRow, bulkUpdateCell, bulkDeleteRows, checkDuplicate,
    searchTeamData, clearSystemCache
} from '../lib/api';

const ITEMS_PER_PAGE = 20;
const STALE_WAIT_DAYS = 3;

const parseRowDate = (raw) => {
    const s = String(raw || '').trim();
    const ny = (y) => (y >= 2400 ? y - 543 : y);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(ny(+m[1]), +m[2] - 1, +m[3]).getTime();
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(ny(+m[3]), +m[2] - 1, +m[1]).getTime();
    const t = Date.parse(s);
    return isNaN(t) ? NaN : t;
};

const classifyTask = (headers, row) => {
    if (!headers || !row) return { follow_up: false, waiting: false, pending_request: false, stale_waiting: false };
    const find = (pred) => headers.findIndex(h => h && pred(String(h)));
    const val = (i) => i > -1 ? String(row[i] || '').trim() : '';
    const status = val(find(h => h.includes('สถานะ')));
    const contacted = val(find(h => h.includes('ทัก')));
    const shippedIdx = find(h => h.includes('ส่งของ'));
    const clipIdx = find(h => h.includes('ลงคลิป'));
    const shipped = val(shippedIdx);
    const clip = val(clipIdx);
    const accepted = (status.includes('รับข้อเสนอ') && !status.includes('ไม่รับ')) || status.includes('ดีลจบ');
    const dropped = status.includes('ไม่รับ') || status.includes('ปฏิเสธ') || status.includes('เรทการ์ด') || status.includes('ไม่อ่าน') || status.includes('ไม่ตอบ');
    const pending_request = status.includes('รับข้อเสนอ') && status.includes('ยังไม่กดขอ');
    const waiting = contacted.includes('ทักแล้ว') && !accepted && !dropped;
    const shipPending = shippedIdx > -1 && !shipped.includes('ส่งแล้ว');
    const clipPending = clipIdx > -1 && !clip.includes('ลงคลิปแล้ว') && !clip.includes('ลงแล้ว');
    const follow_up = accepted && (shipPending || clipPending);
    let stale_waiting = false;
    if (waiting) {
        const dateIdx = headers.findIndex(h => h && String(h).includes('วันที่'));
        const t = dateIdx > -1 ? parseRowDate(row[dateIdx]) : NaN;
        if (!isNaN(t)) {
            const days = Math.floor((Date.now() - t) / 86400000);
            stale_waiting = days >= STALE_WAIT_DAYS;
        }
    }
    return { follow_up, waiting, pending_request, stale_waiting };
};

const isBlankRow = (headers, row) => {
    if (!headers || !row) return false;
    const skip = ['ลำดับ', 'วันที่', 'จำนวน'];
    for (let i = 0; i < headers.length; i++) {
        const h = String(headers[i] || '').trim();
        if (skip.includes(h)) continue;
        const v = String(row[i] == null ? '' : row[i]).trim();
        if (v !== '' && v !== '-') return false;
    }
    return true;
};

const FilterDropdown = ({ value, onChange, options }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const ref = React.useRef(null);
    React.useEffect(() => {
        const handleClickOutside = (event) => { if (ref.current && !ref.current.contains(event.target)) setIsOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const getStyle = (val) => {
        if (val === 'ALL') return "bg-white border-slate-200 text-slate-600 hover:border-slate-300";
        if (val === 'Replied') return "bg-[#215E61]/10 border-[#215E61]/25 text-[#215E61] font-bold";
        if (val === 'รับข้อเสนอ') return "bg-emerald-50 border-emerald-200 text-emerald-700 font-bold";
        if (val === 'No Status' || val === 'ไม่มีสถานะ') return "bg-slate-100 border-slate-300 text-slate-600 font-bold";
        return getStatusColor(val, "สถานะ");
    };
    const activeStyle = getStyle(value);
    const specialOptions = [
        { label: 'Accepted (รับข้อเสนอ)', val: 'รับข้อเสนอ', icon: <Icons.CheckCircle2 size={14} className="text-emerald-500" /> },
        { label: 'Replied (ตอบแล้ว)', val: 'Replied', icon: <Icons.CheckCircle2 size={14} className="text-[#215E61]" /> },
        { label: 'No Status (ไม่มีสถานะ)', val: 'No Status', icon: <div className="w-3 h-3 rounded-full border border-slate-400 bg-transparent" /> }
    ];
    return (
        <div className="relative z-50" ref={ref}>
            <button onClick={() => setIsOpen(!isOpen)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border shadow-sm transition-all duration-200 w-full md:w-auto md:min-w-[160px] justify-between ${activeStyle} ${isOpen ? 'ring-2 ring-offset-1 ring-slate-200' : ''} hover:-translate-y-0.5 hover:shadow-md active:translate-y-0`}>
                <div className="flex items-center gap-2 overflow-hidden">
                    <div className={`p-1 rounded-lg shrink-0 ${value === 'ALL' ? 'bg-slate-100 text-slate-400' : 'bg-white/30 backdrop-blur-sm'}`}><Icons.Filter size={14} /></div>
                    <span className="truncate text-sm">{value === 'ALL' ? 'สถานะ (ทั้งหมด)' : (value === 'Replied' ? 'ตอบแล้ว (Replied)' : value)}</span>
                </div>
                <Icons.ChevronDown size={14} className={`opacity-60 transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 animate-enter max-h-[400px] overflow-y-auto custom-scrollbar ring-1 ring-slate-900/5">
                    <button onClick={() => { onChange('ALL'); setIsOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold mb-1 transition-colors flex items-center justify-between group ${value === 'ALL' ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
                        <span className="flex items-center gap-2"><Icons.Layers size={14} className="opacity-50" /> ทั้งหมด (All)</span>
                        {value === 'ALL' && <Icons.Check size={16} />}
                    </button>
                    <div className="my-1 border-t border-slate-50 mx-2"></div>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Special Filters</div>
                    {specialOptions.map(opt => (
                        <button key={opt.val} onClick={() => { onChange(opt.val); setIsOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold mb-1 transition-colors flex items-center justify-between ${value === opt.val ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
                            <span className="flex items-center gap-2">{opt.icon} {opt.label}</span>
                            {value === opt.val && <Icons.Check size={16} />}
                        </button>
                    ))}
                    <div className="my-1 border-t border-slate-50 mx-2"></div>
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">By Status</div>
                    {options.map(opt => {
                        if (opt === '-' || opt === '') return null;
                        const colorClass = getStatusColor(opt, "สถานะ");
                        const isSelected = value === opt;
                        return (
                            <button key={opt} onClick={() => { onChange(opt); setIsOpen(false); }} className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium mb-1 transition-all flex items-center justify-between group border border-transparent ${isSelected ? 'brightness-95 shadow-sm ring-1 ring-black/5 transform scale-[0.98]' : 'hover:scale-[0.98] hover:shadow-sm opacity-90 hover:opacity-100'} ${colorClass}`}>
                                <span>{opt}</span>
                                {isSelected && <Icons.Check size={14} className="opacity-70" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// dropdown รวมตัวกรอง "งานค้าง" (แทน chip row) — วางบนสุดใต้ toolbar
const TaskFilterDropdown = ({ filters, active, onSelect, onClear, hideBlank, onToggleHideBlank, blankCount }) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);
    React.useEffect(() => {
        const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);
    const activeChip = filters.find(f => f.key === active);
    const anyOn = !!active || hideBlank;
    // ปุ่มหลักเปลี่ยนสีตามหัวข้อที่เลือกอยู่ (ใช้สีเดียวกับ activeCls ของ chip นั้น) แทนสีเขียวคงที่เดิม
    // ไม่มีหัวข้อเลือก (เช่น เลือกแค่ "ซ่อนแถวว่าง") ใช้สีเทาเข้มกลางๆ แทน
    const onColorCls = activeChip ? activeChip.activeCls : (anyOn ? 'bg-slate-800 text-white border-slate-800' : '');
    return (
        <div className="relative z-50 inline-block" ref={ref}>
            <button onClick={() => setOpen(!open)} aria-expanded={open} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border shadow-sm transition-all duration-200 min-w-[150px] justify-between ${anyOn ? onColorCls : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'} ${open ? 'ring-2 ring-offset-1 ring-slate-200' : ''} hover:-translate-y-0.5 hover:shadow-md active:translate-y-0`}>
                <span className="flex items-center gap-2 truncate text-sm font-bold">
                    <Icons.Filter size={14} /> งานค้าง
                    {anyOn && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/25">{activeChip ? activeChip.label : 'ซ่อนว่าง'}</span>}
                </span>
                <Icons.ChevronDown size={14} className={`opacity-70 transition-transform duration-300 shrink-0 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-100 p-2 animate-enter ring-1 ring-slate-900/5 z-50">
                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">งานค้าง</div>
                    {filters.map(chip => {
                        const on = active === chip.key;
                        return (
                            <button key={chip.key} onClick={() => { onSelect(chip.key); setOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold mb-1 transition-colors flex items-center justify-between border ${on ? chip.activeCls + ' shadow-sm' : chip.cls + ' hover:brightness-95'}`}>
                                <span className="flex items-center gap-2">{chip.icon} {chip.label}</span>
                                <span className="flex items-center gap-1.5">
                                    <span className={`min-w-[18px] text-center px-1 rounded-md text-[10px] ${on ? 'bg-white/25' : 'bg-white/70'}`}>{chip.count}</span>
                                    {on && <Icons.Check size={14} />}
                                </span>
                            </button>
                        );
                    })}
                    <div className="my-1 border-t border-slate-50 mx-2"></div>
                    <button onClick={onToggleHideBlank} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold mb-1 transition-colors flex items-center justify-between border ${hideBlank ? 'bg-slate-800 text-white border-slate-800' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                        <span className="flex items-center gap-2"><Icons.Eye size={14} /> ซ่อนแถวว่าง</span>
                        <span className="flex items-center gap-1.5">
                            {blankCount > 0 && <span className={`min-w-[18px] text-center px-1 rounded-md text-[10px] ${hideBlank ? 'bg-white/25' : 'bg-slate-100'}`}>{blankCount}</span>}
                            {hideBlank && <Icons.Check size={14} />}
                        </span>
                    </button>
                    {anyOn && (
                        <button onClick={() => { onClear(); setOpen(false); }} className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Icons.X size={13} /> ล้างทั้งหมด</button>
                    )}
                </div>
            )}
        </div>
    );
};

const QuickStats = ({ rows, headers }) => {
    const stats = React.useMemo(() => {
        const total = rows.length;
        let pending = 0, accepted = 0, dealt = 0;
        const statusIdx = headers.findIndex(h => h.includes('สถานะ'));
        if (statusIdx > -1) {
            rows.forEach(r => {
                const s = String(r.data[statusIdx] || "").toLowerCase();
                if (s.includes('ตัดสินใจ') || s.includes('รอ')) pending++;
                if (s.includes('รับข้อเสนอ') && !s.includes('ไม่รับ')) accepted++;
                if (s.includes('ดีลจบ') || s.includes('อนุมัติ')) dealt++;
            });
        }
        return { total, pending, accepted, dealt };
    }, [rows, headers]);
    if (rows.length === 0) return null;
    return (
        <div className="flex flex-wrap gap-3 py-1 animate-enter">
            <div className="flex items-center gap-3 bg-white pl-3 pr-4 py-2 rounded-2xl shadow-sm border border-slate-100 shrink-0">
                <div className="w-8 h-8 rounded-full bg-[#FF9E20] text-[#3a1a00] flex items-center justify-center font-bold text-xs shadow-md shadow-orange-300/50">{stats.total}</div>
                <span className="text-xs font-bold text-slate-600">รายการ<br /><span className="text-[10px] font-normal text-slate-400">ในหน้านี้</span></span>
            </div>
            <div className="flex items-center gap-3 bg-white pl-3 pr-4 py-2 rounded-2xl shadow-sm border border-amber-400/40 shrink-0">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center"><Icons.Target size={14} strokeWidth={3} /></div>
                <div className="flex flex-col"><span className="text-xs font-bold text-amber-700">{stats.pending}</span><span className="text-[10px] font-medium text-amber-600/80 uppercase">รอลุ้น</span></div>
            </div>
            <div className="flex items-center gap-3 bg-white pl-3 pr-4 py-2 rounded-2xl shadow-sm border border-emerald-400/40 shrink-0">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><Icons.CheckCircle2 size={14} strokeWidth={3} /></div>
                <div className="flex flex-col"><span className="text-xs font-bold text-emerald-700">{stats.accepted}</span><span className="text-[10px] font-medium text-emerald-600/80 uppercase">รับงาน</span></div>
            </div>
        </div>
    );
};

const BulkStatusButton = ({ onSelect, disabled }) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);
    React.useEffect(() => {
        const handleClickOutside = (event) => { if (ref.current && !ref.current.contains(event.target)) setOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const options = COLUMN_CONFIG["สถานะ"].options.filter(o => o !== '-');
    return (
        <div className="relative" ref={ref}>
            <button disabled={disabled} onClick={() => setOpen(o => !o)} className="flex items-center gap-2 px-4 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-bold text-white disabled:opacity-40 transition-colors whitespace-nowrap">
                เปลี่ยนสถานะ <Icons.ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="absolute top-full mt-2 right-0 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 max-h-[320px] overflow-y-auto custom-scrollbar z-50 animate-enter">
                    {options.map(o => (
                        <button key={o} onClick={() => { onSelect(o); setOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-medium mb-1 transition-all ${getStatusColor(o, 'สถานะ')}`}>{o}</button>
                    ))}
                </div>
            )}
        </div>
    );
};

const EmptyState = ({ onReset }) => (
    <div className="flex flex-col items-center justify-center py-20 animate-enter text-center px-4">
        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 bg-slate-100 rounded-full animate-ping opacity-20"></div>
            <Icons.Search size={40} className="text-slate-300" />
        </div>
        <h3 className="text-lg font-bold text-slate-800 mb-2">ไม่พบข้อมูลที่คุณค้นหา</h3>
        <p className="text-sm text-slate-400 max-w-xs mx-auto mb-6">ลองตรวจสอบคำสะกด หรือเปลี่ยนเงื่อนไขการกรองสถานะดูนะครับ</p>
        <button onClick={onReset} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all active:scale-95">
            <Icons.RefreshCw size={16} /> ล้างตัวกรองทั้งหมด
        </button>
    </div>
);

const PullToRefresh = ({ onRefresh, refreshing, scrollClassName, children }) => {
    const [pull, setPull] = React.useState(0);
    const startY = React.useRef(0);
    const pulling = React.useRef(false);
    const scrollRef = React.useRef(null);
    const THRESHOLD = 70;
    const onTouchStart = (e) => {
        const el = scrollRef.current;
        pulling.current = !!(el && el.scrollTop <= 0);
        if (pulling.current) startY.current = e.touches[0].clientY;
    };
    const onTouchMove = (e) => {
        if (!pulling.current || refreshing) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 0) setPull(Math.min(dy * 0.5, 90));
    };
    const onTouchEnd = () => {
        if (!pulling.current) return;
        pulling.current = false;
        if (pull >= THRESHOLD && !refreshing) onRefresh();
        setPull(0);
    };
    const armed = pull >= THRESHOLD;
    return (
        <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
            {(pull > 0 || refreshing) && (
                <div className="absolute top-2 left-0 right-0 flex justify-center z-20 pointer-events-none">
                    <div className={`bg-white shadow-md rounded-full p-2 border border-slate-100 transition-colors ${refreshing || armed ? 'text-[#215E61]' : 'text-slate-300'}`}>
                        <Icons.RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)` }} />
                    </div>
                </div>
            )}
            <div ref={scrollRef} className={scrollClassName} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: pull ? 'none' : 'transform 0.25s ease' }}>
                {children}
            </div>
        </div>
    );
};

const App = () => {
    const LOGO_URL = "";

    const [activeTab, setActiveTab] = useStickyState("", "crm_active_tab");
    const [activeTeam, setActiveTeam] = useStickyState("", "crm_active_team");
    const [view, setView] = React.useState('list');
    const [allSheets, setAllSheets] = React.useState([]);
    const [viewModePref, setViewModePref] = useStickyState('card', "crm_view_mode_pref");
    const [sortOrder, setSortOrder] = useStickyState('oldest', "crm_sort_order_v2");
    const [hideBlank, setHideBlank] = useStickyState(true, "crm_hide_blank_v2");
    const [isNarrowScreen, setIsNarrowScreen] = React.useState(window.innerWidth < 768);
    const viewMode = isNarrowScreen ? 'card' : viewModePref;

    const [headers, setHeaders] = React.useState([]);
    const [rows, setRows] = React.useState([]);
    const [dashboardData, setDashboardData] = React.useState(null);

    const [isLoading, setIsLoading] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isConfigLoading, setIsConfigLoading] = React.useState(true);
    const [loadingDashboard, setLoadingDashboard] = React.useState(false);

    const [dashboardFilterType, setDashboardFilterType] = React.useState('ALL');
    const [dashboardFilterValue, setDashboardFilterValue] = React.useState('');
    const [statusFilter, setStatusFilter] = React.useState('ALL');
    const [quickFilter, setQuickFilter] = React.useState(null);

    const [searchTerm, setSearchTerm] = React.useState("");
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const [globalMode, setGlobalMode] = React.useState(false);
    const [globalResults, setGlobalResults] = React.useState(null);
    const [globalLoading, setGlobalLoading] = React.useState(false);

    const [currentPage, setCurrentPage] = React.useState(1);
    const [modalOpen, setModalOpen] = React.useState(false);
    const [formNonce, setFormNonce] = React.useState(0);
    const [editingRowIndex, setEditingRowIndex] = React.useState(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [infoRowIndex, setInfoRowIndex] = React.useState(null);
    const [loadingCells, setLoadingCells] = React.useState(new Set());
    const [alertConfig, setAlertConfig] = React.useState({ isOpen: false });
    const [toasts, setToasts] = React.useState([]);

    // ปุ่มเลื่อนขึ้นด่วน — scroll container ต่างกัน: desktop=main, มือถือ=window
    // อยู่ในแถว pagination เลย (ไม่ fixed) กันชนกับปุ่ม Add/ปุ่มเลื่อนหน้าที่ก็อยู่มุมเดิม
    const mainRef = React.useRef(null);
    const scrollToTop = () => {
        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    const alertResolver = React.useRef(null);
    const activeTabRef = React.useRef("");
    const mutationSeq = React.useRef(0);

    const [selectMode, setSelectMode] = React.useState(false);
    const [selectedRows, setSelectedRows] = React.useState(new Set());
    const [isBulkSubmitting, setIsBulkSubmitting] = React.useState(false);

    const [expandedRows, setExpandedRows] = React.useState(new Set());
    const toggleRowExpand = (originalIndex) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(originalIndex)) next.delete(originalIndex); else next.add(originalIndex);
            return next;
        });
    };

    const showAlert = ({ type, title, description, confirmText, cancelText }) => {
        return new Promise((resolve) => {
            alertResolver.current = resolve;
            setAlertConfig({ isOpen: true, type, title, description, confirmText, cancelText });
        });
    };
    const closeAlert = (result) => {
        setAlertConfig(prev => ({ ...prev, isOpen: false }));
        if (alertResolver.current) alertResolver.current(result);
    };
    const showToast = (type, title, description, options = {}) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev, { id, type, title, description, ...options }]);
    };
    const closeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));
    const clearFilters = () => { setSearchTerm(""); setStatusFilter("ALL"); setQuickFilter(null); setCurrentPage(1); };
    const handleStatusFilterChange = (v) => { setStatusFilter(v); setQuickFilter(null); setCurrentPage(1); };
    const handleQuickFilter = (key) => { setQuickFilter(prev => { const next = prev === key ? null : key; if (next) setStatusFilter('ALL'); return next; }); setCurrentPage(1); };
    const refreshDashboardSilently = () => {
        fetchDashboardData().then(res => {
            if (res.success) {
                setDashboardData(res.data);
                localStorage.setItem("crm_dashboard_cache", JSON.stringify(res.data));
            }
        });
    };

    React.useEffect(() => {
        const handleResize = () => setIsNarrowScreen(window.innerWidth < 768);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    React.useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    const loadConfig = async () => {
        setIsConfigLoading(true);
        try {
            const cachedConfig = localStorage.getItem("crm_config_cache");
            if (cachedConfig) {
                const parsed = JSON.parse(cachedConfig);
                setAllSheets(parsed);
                setIsConfigLoading(false);
            }
            const res = await fetchSheetNames();
            if (res.success && res.data.length > 0) {
                setAllSheets(res.data);
                localStorage.setItem("crm_config_cache", JSON.stringify(res.data));
                const teams = Array.from(new Set(res.data.map(s => s.source)));
                if (teams.length > 0) {
                    if (!activeTeam || !teams.includes(activeTeam)) {
                        const firstTeam = teams[0];
                        setActiveTeam(firstTeam);
                        const firstTab = res.data.find(s => s.source === firstTeam);
                        if (firstTab) setActiveTab(firstTab.name);
                    }
                }
            }
        } catch (e) { console.error(e); }
        setIsConfigLoading(false);
    };

    React.useEffect(() => {
        const initApp = async () => {
            await loadConfig();
            setLoadingDashboard(true);
            const cachedDash = localStorage.getItem("crm_dashboard_cache");
            if (cachedDash) {
                setDashboardData(JSON.parse(cachedDash));
                setLoadingDashboard(false);
            }
            try {
                const res = await fetchDashboardData();
                if (res.success) {
                    setDashboardData(res.data);
                    localStorage.setItem("crm_dashboard_cache", JSON.stringify(res.data));
                }
            } catch (err) { console.error(err); }
            setLoadingDashboard(false);
        };
        initApp();
    }, []);

    React.useEffect(() => {
        if (view === 'list' && activeTab) {
            loadData(activeTab);
            setCurrentPage(1);
        }
        setSelectMode(false);
        setSelectedRows(new Set());
        setExpandedRows(new Set());
    }, [activeTab, view]);

    const teams = React.useMemo(() => Array.from(new Set(allSheets.map(s => s.source))), [allSheets]);
    const filteredTabs = React.useMemo(() => allSheets.filter(s => s.source === activeTeam), [allSheets, activeTeam]);

    const handleTeamChange = (team) => {
        setActiveTeam(team);
        const firstTab = allSheets.find(s => s.source === team);
        if (firstTab) setActiveTab(firstTab.name);
    };

    const handleForceRefresh = async () => {
        setIsConfigLoading(true);
        try {
            await clearSystemCache();
            await loadConfig();
            showToast('success', 'ซิงก์ทีมแล้ว', 'ดึงโครงสร้างทีมล่าสุดแล้ว');
        } catch (e) {
            showAlert({ type: 'error', title: 'ซิงก์ไม่สำเร็จ', description: 'ไม่สามารถรีเฟรชรายชื่อทีมได้' });
        }
        setIsConfigLoading(false);
    };

    const loadData = React.useCallback(async (sheet, silent = false) => {
        if (!sheet) return;
        const cacheKey = `crm_sheet_${sheet}`;
        const cachedData = localStorage.getItem(cacheKey);
        if (cachedData && !silent) {
            const parsed = JSON.parse(cachedData);
            setHeaders(parsed.headers);
            setRows(parsed.data);
            setIsRefreshing(true);
        } else {
            if (!silent) setIsLoading(true); else setIsRefreshing(true);
        }
        try {
            const res = await fetchSheetData(sheet);
            if (sheet !== activeTabRef.current) return;
            if (res.error) throw new Error(res.error);
            setHeaders(res.headers);
            setRows(res.data);
            localStorage.setItem(cacheKey, JSON.stringify({ headers: res.headers, data: res.data, timestamp: Date.now() }));
        } catch (error) {
            if (sheet === activeTabRef.current && !cachedData) {
                showAlert({ type: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', description: error.message });
            }
        } finally {
            if (sheet === activeTabRef.current) { setIsLoading(false); setIsRefreshing(false); }
        }
    }, []);

    const filteredRows = React.useMemo(() => {
        // เรียงตามคอลัมน์ "ลำดับ" (เลขรันเพิ่มตอน add ทีละแถว) แทนวันที่ — วันที่บางแถวพิมพ์ผิดรูป
        // ในชีตจริง (เช่น "20226-04-28" ปีเกินมา 1 หลัก) parse ไม่ได้แล้วหลุดไปเรียงตาม
        // originalIndex เฉยๆ ทำให้ลำดับดูสลับมั่วเวลาปนกับแถวที่ parse วันที่ได้ปกติ
        const seqIdx = headers.findIndex(h => h && h.trim() === 'ลำดับ');
        const list = rows.map((r, i) => ({ data: r, originalIndex: i })).filter(item => {
            const matchesSearch = !debouncedSearchTerm || item.data.some(cell => String(cell).toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
            let matchesStatus = true;
            if (statusFilter !== 'ALL') {
                const statusIdx = headers.findIndex(h => h.includes('สถานะ'));
                if (statusIdx > -1) {
                    const rowStatus = String(item.data[statusIdx] || "").toLowerCase();
                    if (statusFilter === 'Pending') matchesStatus = rowStatus.includes('กำลังตัดสินใจ');
                    else if (statusFilter === 'Ghosted') matchesStatus = rowStatus.includes('ไม่อ่าน') || rowStatus.includes('อ่าน แต่ไม่ตอบ') || rowStatus.includes('อ่านไม่ตอบ');
                    else if (statusFilter === 'Replied') {
                        const isGhosted = rowStatus.includes('ไม่อ่าน') || rowStatus.includes('อ่าน แต่ไม่ตอบ') || rowStatus.includes('อ่านไม่ตอบ');
                        const isBlank = rowStatus === '' || rowStatus === '-' || rowStatus === 'unknown';
                        matchesStatus = !isGhosted && !isBlank;
                    } else if (statusFilter === 'รับข้อเสนอ') matchesStatus = rowStatus.includes('รับข้อเสนอ') && !rowStatus.includes('ไม่รับ');
                    else if (statusFilter === 'No Status' || statusFilter === 'ไม่มีสถานะ') matchesStatus = rowStatus === '' || rowStatus === '-' || rowStatus === 'unknown';
                    else matchesStatus = rowStatus.includes(statusFilter.toLowerCase());
                }
            }
            const matchesQuick = !quickFilter || classifyTask(headers, item.data)[quickFilter];
            const matchesBlank = !hideBlank || !isBlankRow(headers, item.data);
            return matchesSearch && matchesStatus && matchesQuick && matchesBlank;
        });
        const dir = sortOrder === 'newest' ? -1 : 1;
        list.sort((a, b) => {
            const sa = seqIdx > -1 ? parseFloat(a.data[seqIdx]) : NaN;
            const sb = seqIdx > -1 ? parseFloat(b.data[seqIdx]) : NaN;
            if (!isNaN(sa) && !isNaN(sb) && sa !== sb) return dir * (sa - sb);
            return dir * (a.originalIndex - b.originalIndex);
        });
        return list;
    }, [rows, debouncedSearchTerm, statusFilter, quickFilter, hideBlank, headers, sortOrder]);

    const quickCounts = React.useMemo(() => {
        const c = { follow_up: 0, waiting: 0, pending_request: 0, stale_waiting: 0, blank: 0 };
        if (!headers.length) return c;
        rows.forEach(r => {
            const t = classifyTask(headers, r);
            if (t.follow_up) c.follow_up++;
            if (t.waiting) c.waiting++;
            if (t.pending_request) c.pending_request++;
            if (t.stale_waiting) c.stale_waiting++;
            if (isBlankRow(headers, r)) c.blank++;
        });
        return c;
    }, [rows, headers]);

    const paginatedItems = React.useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRows.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredRows, currentPage]);

    React.useEffect(() => {
        if (!globalMode) { setGlobalResults(null); setGlobalLoading(false); return; }
        const q = (debouncedSearchTerm || "").trim();
        if (q.length < 2) { setGlobalResults(null); setGlobalLoading(false); return; }
        let cancelled = false;
        setGlobalLoading(true);
        searchTeamData(activeTeam, q)
            .then(res => { if (!cancelled) { setGlobalResults(res && res.success ? res : { groups: [], total: 0 }); setGlobalLoading(false); } })
            .catch(() => { if (!cancelled) { setGlobalResults({ groups: [], total: 0 }); setGlobalLoading(false); } });
        return () => { cancelled = true; };
    }, [globalMode, debouncedSearchTerm, activeTeam]);

    const toggleGlobalMode = () => {
        setGlobalMode(v => { const next = !v; if (!next) setGlobalResults(null); return next; });
    };
    const openGlobalResult = (sheetName) => {
        setGlobalMode(false);
        setGlobalResults(null);
        setCurrentPage(1);
        setActiveTab(sheetName);
    };

    const totalPages = Math.ceil(filteredRows.length / ITEMS_PER_PAGE);

    const handleDashboardDrillDown = (filterKeyword) => {
        setStatusFilter(filterKeyword);
        setView('list');
        if (dashboardFilterType === 'PERSON') {
            setActiveTab(dashboardFilterValue);
            const sheetInfo = allSheets.find(s => s.name === dashboardFilterValue);
            if (sheetInfo) setActiveTeam(sheetInfo.source);
        }
    };

    const handleCellUpdate = async (rowIndex, colIndex, value) => {
        mutationSeq.current++;
        const cellId = `${rowIndex}-${colIndex}`;
        setLoadingCells(prev => new Set(prev).add(cellId));
        const oldRows = [...rows];
        const updatedRow = [...rows[rowIndex]];
        updatedRow[colIndex] = value;
        const newRows = [...rows];
        newRows[rowIndex] = updatedRow;
        setRows(newRows);
        try {
            const res = await updateRow(activeTab, rowIndex, updatedRow, oldRows[rowIndex]);
            if (res && res.conflict) {
                setRows(oldRows);
                showToast('warning', 'ชีตถูกแก้ไปแล้ว', res.error);
                await loadData(activeTab, true);
                return;
            }
            if (!res.success) throw new Error(res.error);
            localStorage.setItem(`crm_sheet_${activeTab}`, JSON.stringify({ headers, data: newRows, timestamp: Date.now() }));
            await loadData(activeTab, true);
        } catch (error) {
            setRows(oldRows);
            showToast('error', 'บันทึกไม่สำเร็จ', 'ไม่สามารถบันทึกค่าได้');
        } finally {
            setLoadingCells(prev => { const next = new Set(prev); next.delete(cellId); return next; });
        }
    };

    const handleFormSubmit = async (data, addAnother = false) => {
        mutationSeq.current++;
        const isEdit = editingRowIndex !== null;
        setIsSubmitting(true);
        try {
            if (editingRowIndex !== null) {
                const res = await updateRow(activeTab, editingRowIndex, data, rows[editingRowIndex]);
                if (res && res.conflict) {
                    showAlert({ type: 'warning', title: 'ชีตถูกแก้ไปแล้ว', description: res.error });
                    setModalOpen(false);
                    await loadData(activeTab, true);
                    return;
                }
                if (!res.success) throw new Error(res.error);
                const newRows = [...rows]; newRows[editingRowIndex] = data;
                setRows(newRows);
                localStorage.setItem(`crm_sheet_${activeTab}`, JSON.stringify({ headers, data: newRows, timestamp: Date.now() }));
                showToast('success', 'บันทึกแล้ว', 'แก้ไขรายการเรียบร้อย');
            } else {
                const norm = s => String(s || '').trim().toLowerCase().replace(/\/+$/, '');
                const digits = s => String(s || '').replace(/\D/g, '');
                const toHandle = s => extractTiktokUsername(s).toLowerCase();
                const linkIdx = headers.findIndex(h => { const x = String(h); return x.includes('ลิงค์') || x.includes('ลิงก์') || x.toLowerCase().includes('tiktok'); });
                const nameIdx = headers.findIndex(h => String(h).includes('ชื่อเล่น') && !String(h).toLowerCase().includes('tiktok'));
                const phoneIdx = headers.findIndex(h => { const x = String(h); return x.includes('เบอร์') || x.includes('โทร'); });
                const contactIdx = headers.findIndex(h => String(h).includes('ช่องทางติดต่อ'));
                const newLinkRaw = linkIdx > -1 ? data[linkIdx] : '';
                const newNameRaw = nameIdx > -1 ? data[nameIdx] : '';
                const newPhoneRaw = phoneIdx > -1 ? data[phoneIdx] : '';
                const newContactRaw = contactIdx > -1 ? data[contactIdx] : '';
                const newLink = norm(newLinkRaw);
                const newName = norm(newNameRaw);
                const newHandle = toHandle(newLinkRaw);
                const newPhone = digits(newPhoneRaw);
                const label = (nameIdx > -1 && data[nameIdx]) ? data[nameIdx] : (data[linkIdx] || 'รายการนี้');
                const takIdx = headers.findIndex(h => String(h).includes('ทัก'));
                const statusIdx = headers.findIndex(h => String(h).includes('สถานะ'));
                let dupDateIdx = headers.findIndex(h => String(h).trim() === 'วันที่');
                if (dupDateIdx === -1) dupDateIdx = headers.findIndex(h => String(h).trim().startsWith('วันที่'));
                const meInfo = allSheets.find(s => s.name === activeTab) || {};
                const wasContacted = r => takIdx > -1 && String(r[takIdx] || '').indexOf('ทักแล้ว') > -1;

                let localMatch = null;
                if (newHandle || newLink || newPhone || newName) {
                    localMatch = rows.find(r => {
                        if (newHandle && linkIdx > -1) { const rh = toHandle(r[linkIdx]); if (rh && rh === newHandle) return true; }
                        if (newLink && linkIdx > -1) { const lk = norm(r[linkIdx]); if (lk && lk === newLink) return true; }
                        if (newPhone.length >= 6 && phoneIdx > -1) { const rp = digits(r[phoneIdx]); if (rp && rp === newPhone) return true; }
                        if (newName && nameIdx > -1) { const nm = norm(r[nameIdx]); if (nm && nm === newName) return true; }
                        return false;
                    }) || null;
                }

                let otherMatches = [];
                if (!addAnother && (newHandle || newLink || newPhone || newContactRaw || newName)) {
                    try {
                        const chk = await checkDuplicate(newLinkRaw, newNameRaw, newPhoneRaw, newContactRaw);
                        if (chk && chk.success && Array.isArray(chk.matches)) {
                            const seen = new Set();
                            chk.matches.forEach(m => {
                                if (!m || m.sheet === activeTab || seen.has(m.sheet)) return;
                                seen.add(m.sheet);
                                otherMatches.push(m);
                            });
                        }
                    } catch (e) { /* เช็คซ้ำเป็นแค่ตัวช่วย */ }
                }

                const dupList = [];
                if (localMatch) dupList.push({ owner: meInfo.label || activeTab, source: meInfo.source || activeTeam, contacted: wasContacted(localMatch), status: statusIdx > -1 ? String(localMatch[statusIdx] || '').trim() : '', date: dupDateIdx > -1 ? String(localMatch[dupDateIdx] || '').trim() : '', here: true });
                otherMatches.forEach(m => dupList.push({ owner: m.owner || m.label || m.sheet, source: m.source, contacted: m.contacted, status: m.status, date: m.date, here: false }));

                if (dupList.length) {
                    const desc = (
                        <span className="block text-left">
                            <span className="block mb-3 text-center"><b className="text-slate-700">"{label}"</b> เคยมีในระบบแล้ว</span>
                            {dupList.slice(0, 5).map((m, i) => (
                                <span key={i} className="block mb-2 pl-2.5 border-l-2 border-slate-200">
                                    <span className="block text-slate-700 font-semibold">ของ {m.owner}{m.source ? ` · ทีม ${m.source}` : ''}{m.here ? ' (ชีตนี้)' : ''}</span>
                                    <span className="block text-xs mt-0.5">
                                        <span className={m.contacted ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>{m.contacted ? '✓ เคยทักแล้ว' : '• ยังไม่ทัก'}</span>
                                        {m.status ? <span className="text-slate-500"> · {m.status}</span> : null}
                                        {m.date ? <span className="text-slate-400"> · {m.date}</span> : null}
                                    </span>
                                </span>
                            ))}
                            <span className="block mt-3 text-center text-slate-500">ยังต้องการเพิ่มซ้ำหรือไม่?</span>
                        </span>
                    );
                    const proceed = await showAlert({ type: 'warning', title: 'อาจเป็นรายชื่อซ้ำ', description: desc, confirmText: 'เพิ่มต่อไป', cancelText: 'ยกเลิก' });
                    if (proceed !== 'confirmed') { setIsSubmitting(false); return; }
                }

                const seqIdx = headers.indexOf('ลำดับ');
                const dateIdx = headers.indexOf('วันที่');
                const countIdx = headers.indexOf('จำนวน');
                const today = todayISO();
                if (countIdx > -1 && dateIdx > -1 && data[dateIdx] === today) {
                    const countToday = rows.filter(r => r[dateIdx] === today).length + 1;
                    data[countIdx] = countToday;
                }
                if (seqIdx > -1 && (!data[seqIdx] || data[seqIdx] === '')) {
                    data[seqIdx] = rows.length + 1;
                }
                const res = await addRow(activeTab, data);
                if (!res.success) throw new Error(res.error);
                const newRows = [...rows, data];
                setRows(newRows);
                localStorage.setItem(`crm_sheet_${activeTab}`, JSON.stringify({ headers, data: newRows, timestamp: Date.now() }));
                showToast('success', 'เพิ่มแล้ว', 'เพิ่มรายการใหม่เรียบร้อย');
            }

            if (!isEdit && addAnother) {
                setFormNonce(n => n + 1);
            } else {
                refreshDashboardSilently();
                setModalOpen(false);
                await loadData(activeTab, true);
            }
        } catch (error) {
            showAlert({ type: 'error', title: 'ทำรายการไม่สำเร็จ', description: error.message });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (rowIndex) => {
        const deletedRow = rows[rowIndex];
        const oldRows = [...rows];
        const newRows = rows.filter((_, i) => i !== rowIndex);
        mutationSeq.current++;
        const mySeq = mutationSeq.current;
        setRows(newRows);
        try {
            const res = await deleteRow(activeTab, rowIndex, deletedRow);
            if (res && res.conflict) {
                setRows(oldRows);
                showToast('warning', 'ชีตถูกแก้ไปแล้ว', res.error);
                await loadData(activeTab, true);
                return;
            }
            if (!res.success) throw new Error(res.error);
            localStorage.setItem(`crm_sheet_${activeTab}`, JSON.stringify({ headers, data: newRows, timestamp: Date.now() }));
            refreshDashboardSilently();
            showToast('success', 'ลบแล้ว', 'ลบรายการออกจากชีตแล้ว', {
                actionLabel: 'เลิกทำ',
                onAction: async () => {
                    if (mutationSeq.current !== mySeq) {
                        showToast('warning', 'กู้คืนไม่ได้แล้ว', 'มีการแก้ไขข้อมูลอื่นหลังจากลบไปแล้ว');
                        return;
                    }
                    const undoRes = await insertRow(activeTab, rowIndex, deletedRow);
                    if (undoRes.success) {
                        showToast('success', 'กู้คืนแล้ว', 'นำรายการกลับมาที่เดิมแล้ว');
                        refreshDashboardSilently();
                        await loadData(activeTab, true);
                    } else {
                        showAlert({ type: 'error', title: 'กู้คืนไม่สำเร็จ', description: undoRes.error || 'ไม่สามารถกู้คืนรายการได้' });
                    }
                }
            });
            await loadData(activeTab, true);
        } catch (error) {
            setRows(oldRows);
            showAlert({ type: 'error', title: 'ลบไม่สำเร็จ', description: 'ไม่สามารถลบรายการได้ กรุณาลองใหม่' });
        }
    };

    const toggleSelectMode = () => { setSelectMode(m => !m); setSelectedRows(new Set()); };
    const toggleRowSelect = (originalIndex) => {
        setSelectedRows(prev => {
            const next = new Set(prev);
            if (next.has(originalIndex)) next.delete(originalIndex); else next.add(originalIndex);
            return next;
        });
    };
    const toggleSelectAllVisible = () => {
        const visibleIdx = paginatedItems.map(i => i.originalIndex);
        setSelectedRows(prev => {
            const allSelected = visibleIdx.every(i => prev.has(i));
            const next = new Set(prev);
            visibleIdx.forEach(i => allSelected ? next.delete(i) : next.add(i));
            return next;
        });
    };

    const handleBulkStatusUpdate = async (newStatus) => {
        const statusIdx = headers.findIndex(h => h.includes('สถานะ'));
        if (statusIdx === -1 || selectedRows.size === 0) return;
        mutationSeq.current++;
        const idxArr = Array.from(selectedRows);
        setIsBulkSubmitting(true);
        const oldRows = rows;
        const newRows = [...rows];
        idxArr.forEach(i => { newRows[i] = [...newRows[i]]; newRows[i][statusIdx] = newStatus; });
        setRows(newRows);
        try {
            const res = await bulkUpdateCell(activeTab, idxArr, statusIdx, newStatus, idxArr.map(i => oldRows[i]));
            if (res && res.conflict) {
                setRows(oldRows);
                showAlert({ type: 'warning', title: 'ชีตถูกแก้ไปแล้ว', description: res.error });
                setSelectMode(false); setSelectedRows(new Set());
                await loadData(activeTab, true);
                return;
            }
            if (!res.success) throw new Error(res.error);
            localStorage.setItem(`crm_sheet_${activeTab}`, JSON.stringify({ headers, data: newRows, timestamp: Date.now() }));
            showToast('success', 'อัปเดตแล้ว', `อัปเดตสถานะ ${idxArr.length} รายการแล้ว`);
            setSelectMode(false); setSelectedRows(new Set());
            refreshDashboardSilently();
        } catch (error) {
            setRows(oldRows);
            showAlert({ type: 'error', title: 'อัปเดตหลายรายการไม่สำเร็จ', description: error.message });
        } finally {
            setIsBulkSubmitting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedRows.size === 0) return;
        const result = await showAlert({ type: 'confirm', title: `ลบ ${selectedRows.size} รายการ?`, description: 'ลบแล้วกู้คืนไม่ได้', confirmText: 'ใช่, ลบเลย', cancelText: 'ยกเลิก' });
        if (result !== 'confirmed') return;
        mutationSeq.current++;
        const idxArr = Array.from(selectedRows);
        setIsBulkSubmitting(true);
        const oldRows = rows;
        const newRows = rows.filter((_, i) => !selectedRows.has(i));
        setRows(newRows);
        try {
            const res = await bulkDeleteRows(activeTab, idxArr, idxArr.map(i => oldRows[i]));
            if (res && res.conflict) {
                setRows(oldRows);
                showAlert({ type: 'warning', title: 'ชีตถูกแก้ไปแล้ว', description: res.error });
                setSelectMode(false); setSelectedRows(new Set());
                await loadData(activeTab, true);
                return;
            }
            if (!res.success) throw new Error(res.error);
            showToast('success', 'ลบแล้ว', `ลบ ${idxArr.length} รายการแล้ว`);
            setSelectMode(false); setSelectedRows(new Set());
            refreshDashboardSilently();
            await loadData(activeTab, true);
        } catch (error) {
            setRows(oldRows);
            showAlert({ type: 'error', title: 'ลบหลายรายการไม่สำเร็จ', description: error.message });
        } finally {
            setIsBulkSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen md:fixed md:inset-0 flex flex-col bg-[#FFF8F6] text-slate-900 font-sans md:overflow-hidden">
            <header className="shrink-0 px-4 md:px-6 py-3 md:py-4 flex items-center justify-between z-30">
                <div className="flex items-center gap-3">
                    {LOGO_URL ? (
                        <img src={LOGO_URL} alt="Logo" className="w-10 h-10 rounded-xl object-contain bg-white shadow-lg border border-slate-100" />
                    ) : (
                        <div className="w-10 h-10 bg-[#215E61] rounded-xl flex items-center justify-center shadow-lg shadow-rose-300/50"><span className="font-extrabold text-xl text-white">T</span></div>
                    )}
                    <h1 className="text-xl font-extrabold tracking-tight text-slate-900 hidden sm:block">TikTok CRM</h1>
                </div>
                <div className="flex items-center gap-3">
                    <a href="https://drive-calculator.vercel.app/" target="_blank" rel="noopener noreferrer" aria-label="คำนวณเรท" className="flex items-center gap-2 bg-gradient-to-r from-[#215E61] to-[#1a4a4d] text-white px-3 md:px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-rose-300/50 transition-all hover:scale-105 active:scale-95 group">
                        <Icons.Calculator size={18} className="group-hover:rotate-12 transition-transform" /><span className="hidden md:inline">คำนวณเรท</span>
                    </a>
                    <a href="https://script-six-rho.vercel.app/pages/sereniz" target="_blank" rel="noopener noreferrer" aria-label="Script" className="flex items-center gap-2 bg-[#215E61] text-white px-3 md:px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all hover:scale-105 hover:bg-[#1a4a4d] active:scale-95 group">
                        <Icons.ExternalLink size={16} className="group-hover:translate-x-0.5 transition-transform" /><span className="hidden md:inline">Script</span>
                    </a>
                    <div className="bg-white p-1 rounded-xl shadow-sm border border-slate-100 flex">
                        <button onClick={() => setView('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'dashboard' ? 'bg-[#215E61] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>Dashboard</button>
                        <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${view === 'list' ? 'bg-[#215E61] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>Records</button>
                    </div>
                </div>
            </header>

            {view === 'list' && (
                <div className="shrink-0 px-4 md:px-6 pb-3 md:pb-4 z-20">
                    <div className="bg-white rounded-2xl p-2 shadow-sm border border-slate-100/60 flex flex-col md:flex-row gap-2 md:gap-4 items-center justify-between">
                        <div className="flex items-center gap-4 flex-1 min-w-0 w-full md:w-auto">
                            <div className="shrink-0 border-r border-slate-100 pr-4">
                                <TeamSelector teams={teams} activeTeam={activeTeam} onChange={handleTeamChange} onRefresh={handleForceRefresh} isLoading={isConfigLoading} />
                            </div>
                            <div className="flex-1 overflow-x-auto no-scrollbar flex items-center gap-1">
                                {isConfigLoading ? (
                                    <div className="flex items-center px-4 text-xs text-slate-500 font-medium"><Icons.Loader2 size={14} className="animate-spin mr-2" /> Loading...</div>
                                ) : (
                                    filteredTabs.map(sheet => (
                                        <button key={sheet.name} onClick={() => setActiveTab(sheet.name)} className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${activeTab === sheet.name ? 'text-white bg-[#215E61]' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                                            {sheet.label || sheet.name}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="hidden md:flex items-center gap-3 shrink-0 w-auto border-l border-slate-100 pl-4 justify-end">
                            <FilterDropdown value={statusFilter} onChange={handleStatusFilterChange} options={COLUMN_CONFIG["สถานะ"].options.filter(o => o !== "-")} />
                            <div className="relative w-64">
                                <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" placeholder={globalMode ? "ค้นทั้งทีม..." : "Search..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all placeholder:text-slate-400 text-slate-700" />
                            </div>
                            <button onClick={toggleGlobalMode} title="ค้นทั้งทีม" aria-pressed={globalMode} className={`flex items-center gap-1.5 h-10 px-3 rounded-xl border text-sm font-bold transition-all shrink-0 whitespace-nowrap ${globalMode ? 'bg-[#215E61] text-white border-[#215E61] shadow-md' : 'bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100'}`}><Icons.Layers size={16} /> ทั้งทีม</button>
                            <button onClick={() => { setSortOrder(o => o === 'newest' ? 'oldest' : 'newest'); setCurrentPage(1); }} title="สลับลำดับ เก่า/ใหม่" aria-label={`ลำดับปัจจุบัน: ${sortOrder === 'newest' ? 'ใหม่สุดก่อน' : 'เก่าสุดก่อน'}`} className="flex items-center gap-1.5 h-10 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-bold transition-all shrink-0 whitespace-nowrap">
                                <Icons.ArrowUpDown size={16} /> {sortOrder === 'newest' ? 'ใหม่สุดก่อน' : 'เก่าสุดก่อน'}
                            </button>
                            <div className="flex items-center gap-0.5 bg-slate-100 p-1 rounded-xl" role="tablist" aria-label="รูปแบบการแสดงข้อมูล">
                                <button onClick={() => setViewModePref('card')} title="มุมมองการ์ด" aria-pressed={viewModePref === 'card'} className={`p-1.5 rounded-lg transition-all ${viewModePref === 'card' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><Icons.LayoutGrid size={18} /></button>
                                <button onClick={() => setViewModePref('table')} title="มุมมองตาราง" aria-pressed={viewModePref === 'table'} className={`p-1.5 rounded-lg transition-all ${viewModePref === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><Icons.List size={18} /></button>
                            </div>
                            <button onClick={handleForceRefresh} title="ซิงก์ทีม" className={`flex items-center gap-1.5 h-10 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-bold transition-all shrink-0 whitespace-nowrap ${isConfigLoading ? 'opacity-60 pointer-events-none' : ''}`}><Icons.RefreshCw size={16} className={isConfigLoading ? 'animate-spin' : ''} /> ซิงก์ทีม</button>
                            <button onClick={toggleSelectMode} title="เลือกหลายรายการ" className={`p-2.5 rounded-xl transition-all ${selectMode ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}><Icons.CheckSquare size={20} /></button>
                            <Button onClick={() => { setEditingRowIndex(null); setModalOpen(true); }} className="rounded-xl shadow-lg shadow-rose-300/50 bg-[#215E61] hover:bg-[#1a4a4d] text-white border-none h-10 px-5"><Icons.Plus size={18} className="mr-2" /> Add</Button>
                        </div>

                        <div className="flex md:hidden flex-col gap-1.5 w-full border-t border-slate-100 pt-1.5">
                            <div className="flex items-center gap-1.5 w-full">
                                <div className="flex-1 min-w-0"><FilterDropdown value={statusFilter} onChange={handleStatusFilterChange} options={COLUMN_CONFIG["สถานะ"].options.filter(o => o !== "-")} /></div>
                                <button onClick={() => { setSortOrder(o => o === 'newest' ? 'oldest' : 'newest'); setCurrentPage(1); }} title={`ลำดับ: ${sortOrder === 'newest' ? 'ใหม่สุดก่อน' : 'เก่าสุดก่อน'}`} className="shrink-0 w-10 h-10 flex flex-col items-center justify-center rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all"><Icons.ArrowUpDown size={15} /><span className="text-[8px] font-bold leading-none mt-0.5">{sortOrder === 'newest' ? 'ใหม่' : 'เก่า'}</span></button>
                                <button onClick={toggleSelectMode} title="เลือกหลายรายการ" className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all ${selectMode ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}><Icons.CheckSquare size={18} /></button>
                            </div>
                            <div className="flex items-center gap-1.5 w-full">
                                <div className="relative flex-1 min-w-0">
                                    <Icons.Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input type="text" placeholder={globalMode ? "ค้นทั้งทีม..." : "Search..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all placeholder:text-slate-400 text-slate-700" />
                                </div>
                                <button onClick={toggleGlobalMode} aria-pressed={globalMode} title="ค้นทั้งทีม" className={`shrink-0 flex items-center gap-1 h-10 px-3 rounded-xl border text-xs font-bold transition-all ${globalMode ? 'bg-[#215E61] text-white border-[#215E61] shadow-md' : 'bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100'}`}><Icons.Layers size={16} /> ทั้งทีม</button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-2 md:mt-3">
                        <TaskFilterDropdown
                            filters={[
                                { key: 'follow_up', label: 'ต้องตามงาน', icon: <Icons.Package size={13} />, count: quickCounts.follow_up, cls: 'bg-violet-50 text-violet-700 border-violet-200', activeCls: 'bg-violet-600 text-white border-violet-600' },
                                { key: 'stale_waiting', label: `ตามได้แล้ว (${STALE_WAIT_DAYS} วัน+)`, icon: <Icons.Clock size={13} />, count: quickCounts.stale_waiting, cls: 'bg-rose-50 text-rose-700 border-rose-200', activeCls: 'bg-rose-600 text-white border-rose-600' },
                                { key: 'waiting', label: 'รอตอบ', icon: <Icons.MoreHorizontal size={13} />, count: quickCounts.waiting, cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', activeCls: 'bg-indigo-600 text-white border-indigo-600' },
                                { key: 'pending_request', label: 'รอขอสินค้า', icon: <Icons.Target size={13} />, count: quickCounts.pending_request, cls: 'bg-cyan-50 text-cyan-700 border-cyan-200', activeCls: 'bg-cyan-600 text-white border-cyan-600' },
                            ]}
                            active={quickFilter}
                            onSelect={handleQuickFilter}
                            onClear={() => { setQuickFilter(null); setHideBlank(false); setCurrentPage(1); }}
                            hideBlank={hideBlank}
                            onToggleHideBlank={() => { setHideBlank(v => !v); setCurrentPage(1); }}
                            blankCount={quickCounts.blank}
                        />
                    </div>

                    {selectMode && (
                        <div className="bg-slate-900 text-white rounded-2xl px-4 py-3 mt-3 flex items-center gap-2 sm:gap-3 shadow-lg animate-enter">
                            <button onClick={toggleSelectMode} className="p-2 hover:bg-white/10 rounded-lg shrink-0"><Icons.X size={18} /></button>
                            <span className="text-sm font-bold flex-1 whitespace-nowrap">{selectedRows.size} รายการที่เลือก</span>
                            <button onClick={toggleSelectAllVisible} className="text-xs font-bold text-slate-300 hover:text-white underline underline-offset-2 hidden sm:block shrink-0">เลือกทั้งหน้า</button>
                            <BulkStatusButton onSelect={handleBulkStatusUpdate} disabled={isBulkSubmitting || selectedRows.size === 0} />
                            <button onClick={handleBulkDelete} disabled={isBulkSubmitting || selectedRows.size === 0} className="w-11 h-11 shrink-0 flex items-center justify-center bg-red-500 hover:bg-red-600 rounded-xl disabled:opacity-40 transition-colors"><Icons.Trash2 size={18} /></button>
                        </div>
                    )}
                </div>
            )}

            {view === 'list' && !selectMode && (
                <button onClick={() => { setEditingRowIndex(null); setModalOpen(true); }} className="md:hidden fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full bg-[#215E61] hover:bg-[#1a4a4d] text-white shadow-xl shadow-rose-300/50 flex items-center justify-center active:scale-95 transition-all" aria-label="Add new record">
                    <Icons.Plus size={26} />
                </button>
            )}

            <main ref={mainRef} className="flex-1 px-6 pb-6 pt-0 min-h-0 md:overflow-y-auto">
                {view === 'list' ? (
                    globalMode ? (
                        <div className="bg-white rounded-[32px] h-full shadow-sm border border-slate-100 flex flex-col overflow-hidden animate-enter">
                            <div className="px-6 pt-4 pb-3 border-b border-slate-50 flex items-center justify-between bg-white z-10">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Icons.Layers size={18} className="text-[#215E61] shrink-0" />
                                    <span className="font-bold text-slate-800 truncate">ค้นทั้งทีม · {activeTeam}</span>
                                    {globalResults && globalResults.total > 0 && (
                                        <span className="shrink-0 text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">{globalResults.total}{globalResults.capped ? '+' : ''} รายการ</span>
                                    )}
                                </div>
                                <button onClick={toggleGlobalMode} title="ปิดการค้นทั้งทีม" className="shrink-0 flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2.5 py-1.5 rounded-lg transition-colors"><Icons.X size={14} /> ปิด</button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 bg-slate-50/50">
                                {globalLoading ? (
                                    <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm font-medium"><Icons.Loader2 size={18} className="animate-spin" /> กำลังค้นทุกชีตในทีม...</div>
                                ) : (debouncedSearchTerm || "").trim().length < 2 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                                        <Icons.Search size={36} className="mb-3 text-slate-300" />
                                        <p className="text-sm font-bold text-slate-500">พิมพ์อย่างน้อย 2 ตัวอักษร</p>
                                        <p className="text-xs mt-1">ค้นชื่อ / ลิงก์ / ข้อความ ทุกชีตในทีม {activeTeam}</p>
                                    </div>
                                ) : !globalResults || globalResults.total === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-center text-slate-400">
                                        <Icons.Search size={36} className="mb-3 text-slate-300" />
                                        <p className="text-sm font-bold text-slate-500">ไม่พบ "{debouncedSearchTerm}" ในทีมนี้</p>
                                        <p className="text-xs mt-1">ลองคำอื่น หรือสลับทีมด้านบน</p>
                                    </div>
                                ) : (
                                    <div className="space-y-5">
                                        {globalResults.groups.map(g => (
                                            <div key={g.sheet}>
                                                <div className="flex items-center gap-2 px-1 mb-2">
                                                    <Icons.Users size={14} className="text-slate-400 shrink-0" />
                                                    <span className="text-sm font-bold text-slate-700 truncate">{g.label || g.sheet}</span>
                                                    <span className="text-[11px] font-bold text-slate-400 bg-white border border-slate-200 px-1.5 py-0.5 rounded-md shrink-0">{g.matches.length}</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                                                    {g.matches.map(m => {
                                                        const stage = getPipelineStage(g.headers, m.row);
                                                        return (
                                                            <button key={g.sheet + ':' + m.originalIndex} onClick={() => openGlobalResult(g.sheet)} className="text-left bg-white rounded-2xl border border-slate-100 hover:border-[#215E61]/40 hover:shadow-md p-3.5 transition-all active:scale-[0.99] flex items-center gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="font-bold text-slate-800 truncate">{getDisplayName(g.headers, m.row)}</div>
                                                                    <div className="flex items-center gap-1.5 mt-1.5">
                                                                        {stage && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getStageChipClasses(stage)}`}>{stage.label}</span>}
                                                                        <span className="text-[10px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md truncate">{g.label || g.sheet}</span>
                                                                    </div>
                                                                </div>
                                                                <Icons.ChevronRight size={16} className="text-slate-300 shrink-0" />
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : isLoading ? (
                        <SkeletonLoader mode={viewMode === 'card' ? 'card' : 'table'} />
                    ) : (
                        <div className="relative animate-enter">
                            {statusFilter !== 'ALL' && (
                                <div className="bg-slate-900 text-white text-xs font-bold px-4 py-1.5 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Icons.Filter size={12} />
                                        <span>Filtering: <span className="text-amber-300">{statusFilter === 'Replied' ? 'ตอบกลับแล้ว' : (statusFilter === 'No Status' ? 'ไม่มีสถานะ' : statusFilter)}</span></span>
                                    </div>
                                    <button onClick={clearFilters} className="hover:text-amber-300"><Icons.X size={14} /></button>
                                </div>
                            )}
                            {filteredRows.length === 0 ? (
                                <EmptyState onReset={clearFilters} />
                            ) : (
                                viewMode === 'table' ? (
                                    <div className="stagger-appear">
                                        <CRMTable
                                            headers={headers}
                                            rows={paginatedItems.map(i => i.data)}
                                            loadingRows={loadingCells}
                                            onUpdateCell={(rIdx, cIdx, val) => handleCellUpdate(paginatedItems[rIdx].originalIndex, cIdx, val)}
                                            onEditRow={(rIdx) => { setEditingRowIndex(paginatedItems[rIdx].originalIndex); setModalOpen(true); }}
                                            onDeleteRow={(rIdx) => handleDelete(paginatedItems[rIdx].originalIndex)}
                                            onOpenInfo={(rIdx) => { setInfoRowIndex(paginatedItems[rIdx].originalIndex); }}
                                            selectMode={selectMode}
                                            isRowSelected={(rIdx) => selectedRows.has(paginatedItems[rIdx].originalIndex)}
                                            onToggleSelect={(rIdx) => toggleRowSelect(paginatedItems[rIdx].originalIndex)}
                                            onToggleSelectAll={toggleSelectAllVisible}
                                            allVisibleSelected={paginatedItems.length > 0 && paginatedItems.every(i => selectedRows.has(i.originalIndex))}
                                        />
                                    </div>
                                ) : (
                                    <div className="stagger-appear pt-1 pb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 content-start">
                                        {paginatedItems.map((item) => <div key={item.originalIndex} className="card-item h-full"><CreatorCard row={item.data} headers={headers} rowIndex={item.originalIndex} loadingRows={loadingCells} onUpdateCell={(rIdx, cIdx, val) => handleCellUpdate(rIdx, cIdx, val)} onEdit={() => { setEditingRowIndex(item.originalIndex); setModalOpen(true); }} onDelete={() => handleDelete(item.originalIndex)} onOpenInfo={() => setInfoRowIndex(item.originalIndex)} selectMode={selectMode} selected={selectedRows.has(item.originalIndex)} onToggleSelect={() => toggleRowSelect(item.originalIndex)} /></div>)}
                                    </div>
                                )
                            )}
                            {filteredRows.length > 0 && (
                                <div className="shrink-0 px-1 py-4 flex items-center justify-between z-20">
                                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">SHOWING {Math.min(filteredRows.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)}-{Math.min(filteredRows.length, currentPage * ITEMS_PER_PAGE)} OF {filteredRows.length}</span>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} title="หน้าแรก" aria-label="ไปหน้าแรก" className="rounded-lg border-slate-200 text-slate-500 hover:text-slate-700"><Icons.ChevronsLeft size={16} /></Button>
                                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded-lg border-slate-200 h-9 px-4 text-xs font-bold text-slate-500 hover:text-slate-700">Prev</Button>
                                        <span className="text-xs font-bold text-slate-600 tabular-nums px-1.5 min-w-[68px] text-center">หน้า {currentPage} / {totalPages || 1}</span>
                                        <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || totalPages === 0} className="rounded-lg border-slate-200 h-9 px-4 text-xs font-bold text-slate-500 hover:text-slate-700">Next</Button>
                                        <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages || totalPages === 0} title="หน้าสุดท้าย" aria-label="ไปหน้าสุดท้าย" className="rounded-lg border-slate-200 text-slate-500 hover:text-slate-700"><Icons.ChevronsRight size={16} /></Button>
                                        <div className="w-px h-5 bg-slate-200 mx-1"></div>
                                        <Button variant="outline" size="icon" onClick={scrollToTop} title="เลื่อนขึ้นบนสุด" aria-label="เลื่อนขึ้นบนสุด" className="rounded-lg border-slate-200 text-[#215E61] hover:text-[#1a4a4d]"><Icons.ChevronUp size={16} /></Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                ) : (
                    <div className="md:h-full md:overflow-y-auto">
                        {loadingDashboard ? (
                            <SkeletonLoader mode="dashboard" />
                        ) : (
                            <React.Suspense fallback={<SkeletonLoader mode="dashboard" />}>
                                <Dashboard data={dashboardData} filterType={dashboardFilterType} filterValue={dashboardFilterValue} onFilterChange={(t, v) => { setDashboardFilterType(t); setDashboardFilterValue(v); }} loading={false} allSheets={allSheets} onDrillDown={handleDashboardDrillDown} />
                            </React.Suspense>
                        )}
                    </div>
                )}
            </main>

            <EditModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSubmit={handleFormSubmit} headers={headers} initialData={editingRowIndex !== null ? rows[editingRowIndex] : null} isSubmitting={isSubmitting} formNonce={formNonce} rowCount={rows.length} />
            <InfoModal isOpen={infoRowIndex !== null} onClose={() => setInfoRowIndex(null)} data={infoRowIndex !== null ? rows[infoRowIndex] : null} headers={headers} />
            <AlertModal isOpen={alertConfig.isOpen} type={alertConfig.type} title={alertConfig.title} description={alertConfig.description} confirmText={alertConfig.confirmText} cancelText={alertConfig.cancelText} onConfirm={() => closeAlert('confirmed')} onCancel={() => closeAlert('cancelled')} />

            <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-[10001] pointer-events-none">
                {toasts.map(t => (<Toast key={t.id} {...t} onClose={closeToast} />))}
            </div>
        </div>
    );
};

export default App;
