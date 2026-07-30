import React from 'react';
import { Icons } from './Icons';
import { Portal, Button, SmartSelect } from './UI_Lib';
import { COLUMN_CONFIG, HIDDEN_COLUMNS, INFO_DETAIL_COLUMNS, getColumnConfig, getChecklistItems, getDisplayName, todayISO } from '../lib/columns';

// --- Alert graphics ---
const AlertGraphics = {
    Success: () => (
        <div className="relative flex items-center justify-center w-24 h-24 mb-4">
            <div className="absolute inset-0 bg-emerald-100 rounded-full opacity-50 animate-pulse"></div>
            <div className="absolute w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <div className="absolute top-2 right-4 w-2 h-2 bg-emerald-300 rounded-full"></div>
            <div className="absolute bottom-2 left-4 w-1.5 h-1.5 bg-emerald-300 rounded-full"></div>
        </div>
    ),
    Warning: () => (
        <div className="relative flex items-center justify-center w-24 h-24 mb-4">
            <div className="absolute inset-0 bg-amber-100 rounded-full opacity-50 animate-pulse"></div>
            <div className="absolute w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div className="absolute top-2 right-6 w-2 h-2 bg-amber-300 rounded-full"></div>
        </div>
    ),
    Error: () => (
        <div className="relative flex items-center justify-center w-24 h-24 mb-4">
            <div className="absolute inset-0 bg-rose-100 rounded-full opacity-50 animate-pulse"></div>
            <div className="absolute w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </div>
            <div className="absolute bottom-4 right-2 w-2 h-2 bg-rose-300 rounded-full"></div>
        </div>
    )
};

export const AlertModal = ({ isOpen, type, title, description, confirmText, cancelText, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    const config = {
        success: { graphic: <AlertGraphics.Success />, btnColor: 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200', defaultTitle: 'Successful' },
        warning: { graphic: <AlertGraphics.Warning />, btnColor: 'bg-amber-400 hover:bg-amber-500 shadow-amber-200', defaultTitle: 'Warning' },
        error: { graphic: <AlertGraphics.Error />, btnColor: 'bg-rose-500 hover:bg-rose-600 shadow-rose-200', defaultTitle: 'Error' },
        confirm: { graphic: <AlertGraphics.Warning />, btnColor: 'bg-slate-900 hover:bg-slate-800 shadow-slate-200', defaultTitle: 'Are you sure?' }
    }[type] || {};

    return (
        <Portal>
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm transition-opacity" onClick={onCancel || (() => {})}></div>
                <div className="relative bg-white rounded-[32px] p-8 w-full max-w-sm flex flex-col items-center text-center shadow-2xl animate-bounce-in">
                    <button onClick={onCancel} className="absolute top-4 right-4 p-2 text-slate-300 hover:text-slate-500 rounded-full hover:bg-slate-50 transition-colors"><Icons.X size={20} /></button>
                    {config.graphic}
                    <h2 className="text-xl font-extrabold text-slate-800 mt-2">{title || config.defaultTitle}</h2>
                    <p className="text-sm text-slate-500 font-medium mt-2 mb-8 leading-relaxed px-2">{description}</p>
                    <div className="flex flex-col gap-3 w-full">
                        <button onClick={onConfirm} className={`w-full py-3.5 rounded-full font-bold text-white text-sm shadow-lg transform transition hover:scale-[1.02] active:scale-95 ${config.btnColor}`}>{confirmText || 'OK'}</button>
                        {cancelText && <button onClick={onCancel} className="w-full py-3.5 rounded-full font-bold text-slate-500 text-sm hover:bg-slate-50 transition-colors">{cancelText}</button>}
                    </div>
                </div>
            </div>
        </Portal>
    );
};

export const Toast = ({ id, type, title, description, onClose, actionLabel, onAction, duration }) => {
    const config = {
        success: { icon: <Icons.Check size={16} className="text-white" />, bg: "bg-emerald-500" },
        error: { icon: <Icons.X size={16} className="text-white" />, bg: "bg-rose-500" },
        warning: { icon: <span className="text-white font-bold text-xs">!</span>, bg: "bg-amber-500" }
    }[type] || {};
    const ttl = duration || (actionLabel ? 6000 : 3000);
    React.useEffect(() => {
        const timer = setTimeout(() => onClose(id), ttl);
        return () => clearTimeout(timer);
    }, [id, onClose, ttl]);

    return (
        <div className="bg-white rounded-2xl p-4 shadow-xl shadow-slate-200 border border-slate-100 flex items-center gap-4 min-w-[300px] animate-toast-slide mb-3 pointer-events-auto">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-md ${config.bg}`}>{config.icon}</div>
            <div className="flex-1 min-w-0 text-left">
                <h4 className="text-sm font-bold text-slate-800">{title}</h4>
                <p className="text-xs text-slate-500 truncate">{description}</p>
            </div>
            {actionLabel && (
                <button onClick={() => { if (onAction) onAction(); onClose(id); }} className="shrink-0 text-xs font-bold text-[#215E61] hover:text-[#1a4a4d] px-3 py-1.5 rounded-lg hover:bg-[#215E61]/10 transition-colors">{actionLabel}</button>
            )}
            <button onClick={() => onClose(id)} className="text-slate-300 hover:text-slate-500"><Icons.X size={16} /></button>
        </div>
    );
};

// label ที่โชว์ในฟอร์มเพิ่ม/แก้ไขเท่านั้น — ไม่กระทบชื่อ header จริงในชีต/Supabase
const FIELD_LABEL_OVERRIDES = { 'จำนวน': 'จำนวนที่ทัก' };

export const EditModal = ({ isOpen, onClose, onSubmit, headers, initialData, isSubmitting, formNonce, rowCount = 0 }) => {
    const [form, setForm] = React.useState({});
    const [showMore, setShowMore] = React.useState(false);
    const firstInputRef = React.useRef(null);

    // ฟอร์มเพิ่ม/แก้ไข ต้องมีครบทุกคอลัมน์ตามชีตจริง 100% ไม่ซ่อนอะไร
    // (HIDDEN_COLUMNS ใช้กรองแค่มุมมองตาราง/การ์ดเท่านั้น)
    const isHidden = () => false;

    const essentialIdx = React.useMemo(() => {
        const hs = (headers || []).map(h => String(h || ''));
        const used = new Set();
        const lc = s => s.toLowerCase();
        const pick = (pred) => {
            for (let i = 0; i < hs.length; i++) {
                if (used.has(i) || isHidden(hs[i])) continue;
                if (pred(hs[i])) { used.add(i); return i; }
            }
            return -1;
        };
        return [
            pick(h => h.includes('ชื่อเล่น') && !h.includes('ลิงค์') && !h.includes('ลิงก์') && !lc(h).includes('tiktok')),
            pick(h => h.includes('ลิงค์') || h.includes('ลิงก์') || lc(h).includes('tiktok')),
            pick(h => h.includes('ผู้ติดตาม') || h.includes('ติดตาม')),
            pick(h => h.includes('ติดต่อกัน')),
        ].filter(i => i !== -1);
    }, [headers]);

    React.useEffect(() => {
        if (!isOpen) return;
        const d = {};
        (headers || []).forEach((h, i) => {
            const c = getColumnConfig(h)?.config || {};
            let v = initialData ? initialData[i] : (c.options?.[0] || "");
            if (!initialData && String(h).trim() === 'ลำดับ') v = rowCount + 1;
            if (c.type === 'date') {
                if (!v) v = todayISO();
                else if (v.includes('/')) {
                    const p = v.split('/');
                    if (p.length === 3) v = `${p[2]}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}`;
                }
            }
            d[i] = v;
        });
        setForm(d);
        setShowMore(false);
        if (!initialData) setTimeout(() => { if (firstInputRef.current) firstInputRef.current.focus(); }, 50);
    }, [isOpen, initialData, headers, formNonce]);

    if (!isOpen) return null;

    const submit = (addAnother) => onSubmit(headers.map((_, i) => form[i]), addAnother);

    const quick = !initialData && essentialIdx.length > 0;
    const essentialSet = new Set(essentialIdx);
    const allNonHidden = (headers || []).map((h, i) => i).filter(i => !isHidden(headers[i]));
    const restIdx = allNonHidden.filter(i => !essentialSet.has(i));

    const renderField = (i, isFirst) => {
        const h = headers[i];
        const c = getColumnConfig(h)?.config || {};
        const isText = c.type !== 'select';
        const enterToAdd = !initialData && isText && (c.type || 'text') !== 'date';
        const label = FIELD_LABEL_OVERRIDES[h] || h;
        return (
            <div key={i} className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase flex justify-between">
                    {label} {c.readOnly && <span className="bg-slate-200 px-1 rounded text-[9px]">AUTO</span>}
                </label>
                {c.type === 'select' ? (
                    <SmartSelect value={form[i] || ""} options={c.options} headerName={h} onChange={v => setForm({ ...form, [i]: v })} variant="form" />
                ) : (
                    <input
                        ref={isFirst ? firstInputRef : undefined}
                        type={c.type || 'text'}
                        readOnly={c.readOnly}
                        className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-200 ${c.readOnly ? 'bg-slate-100 text-slate-400' : 'bg-white'}`}
                        value={form[i] || ""}
                        onChange={e => setForm({ ...form, [i]: e.target.value })}
                        onKeyDown={enterToAdd ? (e) => { if (e.key === 'Enter' && !isSubmitting) { e.preventDefault(); submit(true); } } : undefined}
                    />
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white w-full max-w-2xl rounded-[24px] shadow-2xl flex flex-col max-h-[90vh] animate-enter">
                <div className="flex justify-between items-center px-6 py-4 border-b">
                    <h2 className="font-bold text-lg text-slate-800">{initialData ? "แก้ไขข้อมูล" : "เพิ่มรายการใหม่"}</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"><Icons.X size={20} /></button>
                </div>
                <div className="p-6 overflow-y-auto bg-slate-50 space-y-4">
                    {quick ? (
                        <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {essentialIdx.map((i, k) => renderField(i, k === 0))}
                            </div>
                            {restIdx.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-3 mt-1">
                                        <Icons.Layers size={14} className="text-slate-400" /> ช่องอื่นๆ
                                        <span className="flex-1 border-t border-slate-200"></span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {restIdx.map(i => renderField(i, false))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {allNonHidden.map(i => renderField(i, false))}
                        </div>
                    )}
                </div>
                <div className="p-4 border-t bg-white rounded-b-[24px] flex justify-end gap-2 flex-wrap">
                    <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
                    {!initialData && <Button variant="outline" onClick={() => submit(true)} isLoading={isSubmitting}>บันทึกแล้วเพิ่มต่อ</Button>}
                    <Button onClick={() => submit(false)} isLoading={isSubmitting}>บันทึก</Button>
                </div>
            </div>
        </div>
    );
};

export const InfoModal = ({ isOpen, onClose, data, headers }) => {
    if (!isOpen || !data || !headers) return null;
    const detailCols = INFO_DETAIL_COLUMNS || HIDDEN_COLUMNS || [];
    const details = detailCols.map(colName => {
        const idx = headers.findIndex(h => String(h).trim() === colName);
        if (idx === -1) return null;
        return { label: colName, value: data[idx] };
    }).filter(Boolean);
    const checklist = getChecklistItems(headers, data);
    const checklistDone = checklist.filter(x => x.done).length;
    const name = getDisplayName(headers, data);

    return (
        <Portal>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
                <div className="bg-white w-full max-w-lg rounded-[24px] shadow-2xl flex flex-col max-h-[85vh] animate-enter" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50/50 rounded-t-[24px]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#215E61]/10 flex items-center justify-center text-[#215E61] border border-[#215E61]/18"><Icons.User size={20} /></div>
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ข้อมูลเชิงลึก</div>
                                <h2 className="font-bold text-lg text-slate-800 leading-none">{name}</h2>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {checklist.length > 0 && (
                                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${checklistDone === checklist.length ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                    {checklistDone}/{checklist.length} ขั้นตอน
                                </span>
                            )}
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><Icons.X size={20} /></button>
                        </div>
                    </div>
                    <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                        {checklist.length > 0 && (
                            <div>
                                <div className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1.5"><Icons.CheckSquare size={13} /> เช็คลิสต์ความคืบหน้า</div>
                                <div className="space-y-2">
                                    {checklist.map((item, i) => (
                                        <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border ${item.done ? 'bg-emerald-50/60 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}>
                                            {item.done ? <Icons.CheckCircle2 size={18} className="text-emerald-500 shrink-0" /> : <Icons.Circle size={18} className="text-slate-300 shrink-0" />}
                                            <span className={`text-sm font-semibold flex-1 ${item.done ? 'text-emerald-800' : 'text-slate-500'}`}>{item.label}</span>
                                            {item.value && <span className="text-[11px] text-slate-400 font-medium truncate max-w-[120px]">{item.value}</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {details.length === 0 ? (
                            checklist.length === 0 && <div className="text-center text-slate-400 py-8">ไม่มีข้อมูลเพิ่มเติม</div>
                        ) : (
                            <div>
                                {checklist.length > 0 && <div className="text-xs font-bold text-slate-500 uppercase mb-3 flex items-center gap-1.5"><Icons.User size={13} /> ข้อมูลเพิ่มเติม</div>}
                                <div className="grid grid-cols-1 gap-4">
                                    {details.map((item, i) => (
                                        <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-100 hover:border-[#215E61]/18 transition-colors">
                                            <div className="text-xs font-bold text-slate-500 uppercase mb-1">{item.label}</div>
                                            <div className="text-sm font-semibold text-slate-800 whitespace-pre-wrap break-words">{item.value || "-"}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="p-4 border-t border-slate-50 bg-slate-50/50 rounded-b-[24px] flex justify-end">
                        <Button onClick={onClose}>ปิดหน้าต่าง</Button>
                    </div>
                </div>
            </div>
        </Portal>
    );
};
