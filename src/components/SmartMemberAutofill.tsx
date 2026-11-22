import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Member } from '../types';
import { useApp } from '../context/AppContext';
import { Phone, Mail, Sparkles, Check, Search, ArrowRight } from 'lucide-react';

interface SmartMemberAutofillProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectMember: (payer: Member) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  label?: string;
  autoFocus?: boolean;
}

/**
 * Smart Payer Autofill Component
 * Searches strictly through the database for previous payers who have paid before.
 * Auto-populates telephone and email into the receipt form.
 * Does not include non-paying system users, and Member ID has been removed.
 */
export const SmartMemberAutofill: React.FC<SmartMemberAutofillProps> = ({
  id = 'smart-payer-name',
  value,
  onChange,
  onSelectMember,
  required = false,
  disabled = false,
  label = 'Payer Full Name',
  autoFocus = false
}) => {
  const { payers } = useApp();

  // Strict list of actual past payers who have paid in the database
  const payerList = useMemo(() => {
    return payers || [];
  }, [payers]);

  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [selectedPayerKey, setSelectedPayerKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search and filter previous payers based on user input (name, phone, email)
  const filteredPayers = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q) {
      // When empty, show the 5 most recent past payers
      return payerList.slice(0, 5);
    }
    return payerList.filter(p => {
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchPhone = (p.phone || '').toLowerCase().includes(q);
      const matchEmail = (p.email || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchEmail;
    }).slice(0, 8); // Top 8 suggestions
  }, [payerList, value]);

  // Handle clicking outside to dismiss the suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (payer: Member) => {
    onChange(payer.name);
    setSelectedPayerKey(payer.name);
    onSelectMember(payer);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredPayers.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredPayers.length - 1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < filteredPayers.length) {
        e.preventDefault();
        handleSelect(filteredPayers[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative group w-full">
      {/* Input Field with Floating Label & Smart Payer Indicator */}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          required={required}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
            if (selectedPayerKey && e.target.value !== selectedPayerKey) {
              setSelectedPayerKey(null);
            }
          }}
          onFocus={() => {
            if (payerList.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder=" "
          autoComplete="off"
          className="peer w-full px-4 pt-5 pb-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 text-slate-900 dark:text-white placeholder-transparent text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 shadow-inner pr-32"
        />
        <label
          htmlFor={id}
          className="absolute left-4 top-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider transition-all duration-200 pointer-events-none peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-xs peer-placeholder-shown:font-medium peer-placeholder-shown:normal-case peer-placeholder-shown:tracking-normal peer-focus:top-1.5 peer-focus:text-[10px] peer-focus:font-bold peer-focus:text-blue-600 dark:peer-focus:text-blue-400 peer-focus:uppercase peer-focus:tracking-wider"
        >
          {label} {required && <span className="text-red-500">*</span>}
        </label>

        {/* Right Action / Status Icons */}
        <div className="absolute right-3 top-3.5 flex items-center gap-1.5 pointer-events-none">
          {selectedPayerKey ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-bold border border-emerald-300 dark:border-emerald-800">
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>Autofilled</span>
            </span>
          ) : payerList.length > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 text-[10px] font-semibold border border-blue-200 dark:border-blue-800/60">
              <Sparkles className="w-3 h-3 text-blue-500 animate-pulse" />
              <span>Payer Search</span>
            </span>
          ) : null}
        </div>
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3.5 py-2 bg-slate-50/90 dark:bg-slate-800/60 flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Search className="w-3 h-3 text-blue-600 dark:text-blue-400" />
              <span>
                {filteredPayers.length > 0
                  ? `Previous Payers Found in Database (${filteredPayers.length})`
                  : 'Payer Database Search'}
              </span>
            </span>
            <span className="text-[10px] text-slate-400">Click to autofill phone & email</span>
          </div>

          {filteredPayers.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto overscroll-contain py-1">
              {filteredPayers.map((payer, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const initials = (payer.name || 'P')
                  .split(' ')
                  .map(p => p[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                return (
                  <li
                    key={payer.id || `${payer.name}-${payer.phone}-${idx}`}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(payer)}
                    className={`px-3.5 py-2.5 cursor-pointer transition-colors flex items-center justify-between gap-3 ${
                      isHighlighted
                        ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-100'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Payer Avatar */}
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                        isHighlighted
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}>
                        {initials}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold truncate">
                            {payer.name}
                          </span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            Paid Before
                          </span>
                        </div>

                        {/* Telephone & Email from Database */}
                        <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {payer.phone ? (
                            <span className="flex items-center gap-1 font-mono text-slate-700 dark:text-slate-300 font-semibold">
                              <Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>{payer.phone}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No phone</span>
                          )}

                          {payer.email ? (
                            <span className="flex items-center gap-1 truncate text-slate-600 dark:text-slate-400">
                              <Mail className="w-3 h-3 text-blue-500" />
                              <span className="truncate">{payer.email}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">No email</span>
                          )}
                        </div>

                        {/* Payment History Preview */}
                        {(payer.lastPaymentDate || payer.totalContributed || payer.paymentCount) && (
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                            {payer.paymentCount && (
                              <span>{payer.paymentCount} previous {payer.paymentCount === 1 ? 'payment' : 'payments'}</span>
                            )}
                            {payer.totalContributed && (
                              <span>&bull; Total: {Number(payer.totalContributed).toLocaleString()} UGX</span>
                            )}
                            {payer.lastPaymentDate && (
                              <span>&bull; Last: {payer.lastPaymentDate}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-bold hover:bg-blue-600 hover:text-white transition group-hover:shadow-xs">
                        <span>Autofill</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <p className="font-semibold text-slate-700 dark:text-slate-300">
                No previous payment found for &ldquo;{value}&rdquo;
              </p>
              <p className="text-[11px] text-slate-400">
                You can enter their telephone and email below. Once issued, their details will be saved to the database for future autofill.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
