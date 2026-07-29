import React from 'react';
import ReactDOM from 'react-dom';
import { Icons } from './Icons';
import { getStatusColor } from '../lib/columns';

export const Portal = ({ children }) => ReactDOM.createPortal(children, document.body);

export const Checkbox = ({ checked, onChange, size = 22 }) => (
    <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onChange(); }}
        className={`shrink-0 rounded-md border-2 flex items-center justify-center transition-colors ${checked ? 'bg-slate-900 border-slate-900' : 'bg-white border-slate-300 hover:border-slate-400'}`}
        style={{ width: size, height: size }}
    >
        {checked && <Icons.Check size={Math.round(size * 0.65)} className="text-white" strokeWidth={3} />}
    </button>
);

export const SwipeableRow = ({ children, onEdit, onDelete, disabled }) => {
    const REVEAL = 144;
    const [offset, setOffset] = React.useState(0);
    const [isDragging, setIsDragging] = React.useState(false);
    const draggingRef = React.useRef(false);
    const startRef = React.useRef({ x: 0, offset: 0 });
    const rowIdRef = React.useRef(Math.random().toString(36).slice(2));

    const clamp = (v) => Math.max(-REVEAL, Math.min(0, v));

    React.useEffect(() => {
        const closeOthers = (e) => { if (e.detail !== rowIdRef.current) setOffset(0); };
        window.addEventListener('swiperow:open', closeOthers);
        return () => window.removeEventListener('swiperow:open', closeOthers);
    }, []);

    React.useEffect(() => { if (disabled) setOffset(0); }, [disabled]);

    const onPointerDown = (e) => {
        if (disabled) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startRef.current = { x: e.clientX, offset };
        draggingRef.current = true;
        setIsDragging(true);
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    };
    const onPointerMove = (e) => {
        if (!draggingRef.current) return;
        const dx = e.clientX - startRef.current.x;
        const next = clamp(startRef.current.offset + dx);
        setOffset(next);
        if (next < -10) window.dispatchEvent(new CustomEvent('swiperow:open', { detail: rowIdRef.current }));
    };
    const endDrag = () => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setIsDragging(false);
        setOffset(prev => (prev < -REVEAL / 2 ? -REVEAL : 0));
    };

    return (
        <div className="relative overflow-hidden rounded-[20px]">
            <div className="absolute inset-y-0 right-0 flex" style={{ width: REVEAL }}>
                <button onClick={() => { setOffset(0); onEdit(); }} className="w-[72px] h-full flex flex-col items-center justify-center gap-1 bg-[#215E61] text-white active:bg-[#215E61] transition-colors">
                    <Icons.Edit size={20} /><span className="text-[10px] font-bold">แก้ไข</span>
                </button>
                <button onClick={() => { setOffset(0); onDelete(); }} className="w-[72px] h-full flex flex-col items-center justify-center gap-1 bg-red-500 text-white active:bg-red-600 transition-colors">
                    <Icons.Trash2 size={20} /><span className="text-[10px] font-bold">ลบ</span>
                </button>
            </div>
            <div
                className={`select-none ${isDragging ? '' : 'transition-transform duration-200 ease-out'}`}
                style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onClickCapture={(e) => { if (offset < -5) { e.preventDefault(); e.stopPropagation(); setOffset(0); } }}
            >
                {children}
            </div>
        </div>
    );
};

export const Button = ({ children, variant = 'primary', size = 'md', isLoading, className = '', disabled, ...props }) => {
    const base = "inline-flex items-center justify-center rounded-xl font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none active:scale-95";
    const variants = {
        primary: "bg-[#215E61] text-white hover:bg-[#1a4a4d] shadow-md",
        secondary: "bg-white text-slate-700 border hover:bg-slate-50",
        ghost: "text-slate-600 hover:bg-slate-100",
        outline: "border border-slate-300 text-slate-700 hover:bg-slate-50"
    };
    const sizes = { sm: "h-8 px-3 text-xs", md: "h-11 px-5 text-sm", icon: "h-9 w-9 p-0" };
    return (
        <button className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`} disabled={isLoading || disabled} {...props}>
            {isLoading && <Icons.Loader2 size={16} className="animate-spin mr-2" />}
            {children}
        </button>
    );
};

export const SkeletonLoader = ({ mode = 'table' }) => {
    const Block = ({ className }) => <div className={`skeleton-shimmer ${className}`}></div>;

    if (mode === 'dashboard') {
        return (
            <div className="h-full overflow-y-auto pb-20 space-y-6">
                <Block className="w-full h-48 rounded-[32px]" />
                <Block className="w-64 h-10 rounded-2xl" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => <Block key={i} className="h-32 rounded-[24px]" />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Block className="h-80 rounded-[32px] lg:col-span-2" />
                    <Block className="h-80 rounded-[32px]" />
                </div>
            </div>
        );
    }

    if (mode === 'card') {
        return (
            <div className="flex-1 min-h-0 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 content-start">
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="bg-white rounded-[20px] p-5 shadow-sm border border-slate-100 space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex gap-3 items-center w-full">
                                <Block className="w-12 h-12 rounded-2xl shrink-0" />
                                <div className="space-y-2 w-full max-w-[60%]">
                                    <Block className="h-4 w-full rounded-full" />
                                    <Block className="h-3 w-1/2 rounded-full" />
                                </div>
                            </div>
                        </div>
                        <Block className="h-8 w-full rounded-xl" />
                        <div className="grid grid-cols-2 gap-2">
                            <Block className="h-12 rounded-xl" />
                            <Block className="h-12 rounded-xl" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[32px] h-full shadow-sm border border-slate-100 flex flex-col overflow-hidden relative">
            <div className="flex items-center px-6 py-4 border-b border-slate-50 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => <Block key={i} className={`h-4 rounded-full ${i === 1 ? 'w-8' : 'w-24'}`} />)}
            </div>
            <div className="flex-1 p-6 space-y-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                    <div key={i} className="flex items-center gap-6">
                        <Block className="h-4 w-8 rounded-full" />
                        <Block className="h-4 w-32 rounded-full" />
                        <Block className="h-4 w-24 rounded-full" />
                        <Block className="h-8 w-28 rounded-lg" />
                        <Block className="h-4 w-20 rounded-full" />
                        <Block className="h-4 w-full max-w-[100px] rounded-full" />
                    </div>
                ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-50 flex justify-between items-center">
                <Block className="h-3 w-32 rounded-full" />
                <div className="flex gap-2">
                    <Block className="h-8 w-16 rounded-lg" />
                    <Block className="h-8 w-16 rounded-lg" />
                </div>
            </div>
        </div>
    );
};

export const SmartSelect = ({ value, options, headerName, onChange, isLoading, compact, variant = 'default' }) => {
    const [open, setOpen] = React.useState(false);
    const [isMobile, setIsMobile] = React.useState(false);
    const triggerRef = React.useRef(null);
    const dropdownRef = React.useRef(null);
    const [coords, setCoords] = React.useState({ top: 0, left: 0, width: 0, placement: 'bottom' });

    const getColor = (v) => getStatusColor(v, headerName);
    const activeColorClass = getColor(value);

    React.useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const toggle = (e) => {
        e.stopPropagation();
        if (isLoading) return;
        if (!open && triggerRef.current && !isMobile) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const menuHeight = Math.min(options.length * 40 + 10, 300);
            const openUp = spaceBelow < menuHeight && rect.top > menuHeight;
            setCoords({
                top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
                left: rect.left,
                width: Math.max(rect.width, 180),
                placement: openUp ? 'top' : 'bottom'
            });
        }
        setOpen(!open);
    };

    React.useEffect(() => {
        if (open && !isMobile) {
            const handleScroll = (e) => {
                if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
                setOpen(false);
            };
            window.addEventListener('scroll', handleScroll, true);
            return () => window.removeEventListener('scroll', handleScroll, true);
        }
    }, [open, isMobile]);

    let containerClass = "text-xs font-semibold py-1.5 px-2.5 h-8 shadow-sm rounded-lg border";
    if (compact || variant === 'compact') {
        containerClass = "text-[11px] font-semibold py-2 px-2.5 h-9 rounded-lg border";
    } else if (variant === 'form') {
        containerClass = "text-sm px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 shadow-sm";
    }

    return (
        <>
            <div
                ref={triggerRef}
                onClick={toggle}
                className={`relative cursor-pointer flex items-center justify-between hover:brightness-95 select-none transition-all ${containerClass} ${activeColorClass}`}
            >
                {isLoading ? <div className="w-full flex justify-center"><Icons.Loader2 size={16} className="animate-spin opacity-50" /></div> : <><span className="truncate mr-2">{value || "-"}</span><Icons.ChevronDown size={compact ? 12 : 16} className={`opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} /></>}
            </div>

            {open && (
                <Portal>
                    <div className="fixed inset-0 z-[9998] bg-slate-900/20 backdrop-blur-[2px]" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
                    {isMobile ? (
                        <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-white rounded-t-[32px] shadow-2xl flex flex-col max-h-[85vh] animate-slide-up pb-safe">
                            <div className="flex items-center justify-center pt-3 pb-2" onClick={() => setOpen(false)}>
                                <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
                            </div>
                            <div className="px-6 pb-4 border-b border-slate-50 flex justify-between items-center">
                                <div>
                                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Select Option</div>
                                    <div className="font-bold text-lg text-slate-800">{headerName}</div>
                                </div>
                                <button onClick={() => setOpen(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:bg-slate-100"><Icons.X size={20} /></button>
                            </div>
                            <div className="overflow-y-auto p-4 flex flex-col gap-2 pb-8">
                                {options.map(o => (
                                    <button key={o} onClick={() => { onChange(o); setOpen(false); }} className={`w-full text-left px-5 py-3.5 rounded-xl text-sm font-bold transition-all flex justify-between items-center ${o === value ? 'ring-2 ring-slate-900/10 scale-[0.99]' : 'active:scale-[0.98]'} ${getColor(o)}`}>
                                        <span>{o}</span>
                                        {o === value && <Icons.Check size={18} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div
                            ref={dropdownRef}
                            className="fixed z-[9999] bg-white rounded-xl shadow-xl border p-1 overflow-y-auto animate-enter"
                            style={{ top: coords.top, left: coords.left, width: coords.width, maxHeight: '300px' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {options.map(o => (
                                <button key={o} onClick={() => { onChange(o); setOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium flex justify-between items-center hover:brightness-95 mb-0.5 ${getColor(o)}`}>
                                    <span>{o}</span>
                                    {o === value && <Icons.Check size={14} />}
                                </button>
                            ))}
                        </div>
                    )}
                </Portal>
            )}
        </>
    );
};

export const TeamSelector = ({ teams, activeTeam, onChange, onRefresh, isLoading }) => {
    const [open, setOpen] = React.useState(false);
    return (
        <div className="relative">
            <button onClick={() => setOpen(!open)} className={`flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors ${open ? 'bg-slate-50' : ''}`}>
                <div className="w-10 h-10 rounded-xl bg-[#215E61]/10 flex items-center justify-center text-[#215E61] border border-[#215E61]/18"><Icons.Briefcase size={20} /></div>
                <div className="text-left">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">TEAM</div>
                    <div className="flex items-center gap-1"><span className="text-sm font-bold text-slate-900">{activeTeam}</span><Icons.ChevronDown size={14} className="text-slate-400" /></div>
                </div>
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
                    <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border p-2 z-[61] animate-enter">
                        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase">Select Team</div>
                        {teams.map(t => (
                            <button key={t} onClick={() => { onChange(t); setOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium flex justify-between items-center hover:bg-slate-50 ${activeTeam === t ? 'bg-slate-50 font-bold' : ''}`}>
                                {t} {activeTeam === t && <Icons.Check size={16} />}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
