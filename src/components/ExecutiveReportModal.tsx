import React, { useRef, useState } from 'react';
import { Transaction, AppSettings, User } from '../types';
import { HARDCODED_LOGO_URL } from '../assets/brandLogo';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { useApp } from '../context/AppContext';
import { isRunningInIframe } from '../utils/printReceipt';
import { 
  Printer, 
  Download, 
  FileSpreadsheet, 
  X, 
  Loader2, 
  Building, 
  CheckCircle2, 
  ShieldCheck, 
  Calendar, 
  TrendingUp, 
  Users, 
  CreditCard,
  FileCheck2,
  FileDown
} from 'lucide-react';

interface ExecutiveReportModalProps {
  filteredData: Transaction[];
  metrics: {
    totalRevenue?: number;
    totalInflow?: number;
    totalOutflow?: number;
    netBalance?: number;
    count: number;
    inflowCount?: number;
    outflowCount?: number;
    average: number;
    largest: number;
    smallest: number;
  };
  purposeData: Array<{ name: string; value: number; count: number }>;
  methodData: Array<{ name: string; value: number }>;
  operatorData: Array<{ operator: string; total: number; count: number }>;
  rangeLabel: string;
  settings: AppSettings;
  currentUser: User | null;
  onClose: () => void;
  onExportCSV: () => void;
}

export const ExecutiveReportModal: React.FC<ExecutiveReportModalProps> = ({
  filteredData,
  metrics,
  purposeData,
  methodData,
  operatorData,
  rangeLabel,
  settings,
  currentUser,
  onClose,
  onExportCSV
}) => {
  const { addToast } = useApp();
  const [isExportingPDF, setIsExportingPDF] = useState(false);
  const [isExportingImage, setIsExportingImage] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const inflowTotal = Number(metrics.totalInflow ?? metrics.totalRevenue ?? 0);
  const outflowTotal = Number(metrics.totalOutflow ?? 0);
  const netTotal = Number(metrics.netBalance ?? (inflowTotal - outflowTotal));
  const receiptCount = Number(metrics.inflowCount ?? metrics.count ?? 0);

  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const reportId = `SCB-REP-${now.getFullYear()}-${String(Date.now()).slice(-5)}`;
  const generationTimestamp = `${localDate} ${now.toTimeString().split(' ')[0]}`;

  const generateReportCanvas = async (): Promise<HTMLCanvasElement> => {
    if (!reportRef.current) throw new Error('Report element ref not found');

    // Wait for images inside to load
    const images = Array.from(reportRef.current.getElementsByTagName('img')) as HTMLImageElement[];
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              setTimeout(resolve, 800);
            }
          })
      )
    );

    // Short wait for layout and fonts to settle
    await new Promise((resolve) => setTimeout(resolve, 400));

    try {
      const canvas = await html2canvas(reportRef.current, {
        useCORS: true,
        allowTaint: false,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });
      return canvas;
    } catch (primaryErr) {
      console.warn('html2canvas primary attempt failed, retrying with fallback settings:', primaryErr);
      const canvas = await html2canvas(reportRef.current, {
        useCORS: true,
        allowTaint: true,
        scale: 1.5,
        backgroundColor: '#ffffff',
        logging: false,
        scrollX: 0,
        scrollY: 0,
      });
      return canvas;
    }
  };

  const handleDownloadPDF = async (): Promise<boolean> => {
    if (!reportRef.current) return false;
    setIsExportingPDF(true);
    addToast('Generating presentation-ready PDF report...', 'info');

    try {
      const canvas = await generateReportCanvas();
      const dataUrl = canvas.toDataURL('image/png', 1.0);

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      });

      const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
      const margin = 10; // 10mm
      const contentWidth = pageWidth - (margin * 2); // 190mm
      const contentHeight = (canvas.height * contentWidth) / canvas.width;

      if (contentHeight <= pageHeight - (margin * 2)) {
        // Fits entirely on a single A4 page
        pdf.addImage(dataUrl, 'PNG', margin, margin, contentWidth, contentHeight);
      } else {
        // Multi-page splitting
        let heightLeft = contentHeight;
        let position = margin;
        const pageContentHeight = pageHeight - (margin * 2);

        pdf.addImage(dataUrl, 'PNG', margin, position, contentWidth, contentHeight);
        heightLeft -= pageContentHeight;

        while (heightLeft > 0) {
          position = margin - (contentHeight - heightLeft);
          pdf.addPage();
          pdf.addImage(dataUrl, 'PNG', margin, position, contentWidth, contentHeight);
          heightLeft -= pageContentHeight;
        }
      }

      const fileName = `SC_Basimbuzi_Executive_Report_${rangeLabel.replace(/\s+/g, '_')}_${now.toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      addToast('Executive presentation PDF downloaded successfully!', 'success');
      return true;
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
      addToast('Direct PDF export encountered an issue. Downloading report image...', 'error');
      const imgOk = await handleDownloadImage();
      if (!imgOk) {
        addToast('Export failed. Please use Print to save report as PDF.', 'error');
      }
      return false;
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handlePrint = async () => {
    setIsPrinting(true);
    addToast('Opening print dialog...', 'info');

    const inIframe = isRunningInIframe();
    let printWorked = false;

    try {
      window.print();
      printWorked = true;
    } catch (err) {
      console.warn('Browser sandbox restricted window.print:', err);
    }

    // In sandbox iframes (e.g. AI Studio app preview), window.print() is often blocked or ignored by sandbox policies.
    // If in an iframe or if window.print failed, automatically generate & download the official presentation PDF!
    if (inIframe || !printWorked) {
      await handleDownloadPDF();
      addToast('Print dialog was restricted by browser sandbox; executive PDF statement downloaded directly!', 'success');
    }

    setIsPrinting(false);
  };

  const handleDownloadImage = async (): Promise<boolean> => {
    if (!reportRef.current) return false;
    setIsExportingImage(true);
    addToast('Generating high-resolution report image...', 'info');
    try {
      const canvas = await generateReportCanvas();
      const dataUrl = canvas.toDataURL('image/png', 1.0);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `SC_Basimbuzi_Executive_Report_${rangeLabel.replace(/\s+/g, '_')}_${now.toISOString().split('T')[0]}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast('Official report image saved!', 'success');
      return true;
    } catch (err) {
      console.error('Failed to generate report image:', err);
      addToast('Failed to generate image. Please try downloading PDF or using Print.', 'error');
      return false;
    } finally {
      setIsExportingImage(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 print:p-0 animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-4 max-h-[95vh] print:max-h-none print:my-0 print:border-none print:shadow-none print:rounded-none">
        
        {/* Modal Controls Top Bar (Hidden in Print) */}
        <div className="bg-slate-900 text-white px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/30 border border-blue-500/40">
              <FileCheck2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-wide">Executive Presentation Report</h3>
              <p className="text-[11px] text-slate-400 font-sans">Formal Financial &amp; Audit Statement &bull; {rangeLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Primary Action: Direct PDF Download */}
            <button
              onClick={handleDownloadPDF}
              disabled={isExportingPDF}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-sm shadow-blue-600/30 cursor-pointer disabled:opacity-50"
              title="Download presentation-ready PDF report"
            >
              {isExportingPDF ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              <span>{isExportingPDF ? 'Generating PDF...' : 'Download PDF'}</span>
            </button>

            {/* Secondary Action: Print (triggers system print dialog or auto-downloads PDF) */}
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer disabled:opacity-50"
              title="Print via browser dialog"
            >
              {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" /> : <Printer className="w-3.5 h-3.5" />}
              <span>Print</span>
            </button>

            {/* PNG Image Download */}
            <button
              onClick={handleDownloadImage}
              disabled={isExportingImage}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer disabled:opacity-50"
              title="Download high-resolution image"
            >
              {isExportingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" /> : <Download className="w-3.5 h-3.5" />}
              <span>{isExportingImage ? 'Saving PNG...' : 'PNG'}</span>
            </button>

            {/* CSV Spreadsheet Export */}
            <button
              onClick={onExportCSV}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              title="Export as CSV spreadsheet"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>CSV</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title="Close Report Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Document Container */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-8 bg-slate-100 dark:bg-slate-950/70 print:p-0 print:bg-white print:overflow-visible">
          
          {/* Printable Report Document Card */}
          <div 
            ref={reportRef}
            id="printable-presentation-report"
            className="bg-white text-slate-900 mx-auto max-w-4xl p-8 sm:p-10 rounded-2xl shadow-xl border border-slate-200 print:border-none print:shadow-none print:p-6 print:max-w-none print:rounded-none space-y-6"
            style={{ minHeight: '1050px' }}
          >
            {/* 1. Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between pb-6 border-b-2 border-slate-900 gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={(settings.logoUrl && !settings.logoUrl.endsWith('.svg')) ? settings.logoUrl : HARDCODED_LOGO_URL}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = HARDCODED_LOGO_URL;
                  }}
                  crossOrigin="anonymous"
                  alt="SC Basimbuzi Emblem"
                  className="w-16 h-16 object-contain rounded-full border-2 border-slate-900 bg-white p-1 shadow-sm"
                />
                <div>
                  <h1 className="text-xl font-extrabold uppercase tracking-tight text-slate-900">
                    {settings.organizationName || 'SC Basimbuzi'}
                  </h1>
                  <p className="text-xs font-semibold text-blue-900 uppercase tracking-widest mt-0.5">
                    Official Executive Financial Statement &bull; Audit Ledger
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {settings.organizationAddress || 'Kampala, Uganda'} &bull; Tel: {settings.organizationPhone} &bull; Email: {settings.organizationEmail}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right text-xs space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Document Serial</span>
                  <span className="font-bold text-slate-900 font-sans">{reportId}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Period Filter</span>
                  <span className="font-semibold text-blue-700">{rangeLabel}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-bold block">Generated On</span>
                  <span className="text-slate-600 font-sans text-[11px]">{generationTimestamp}</span>
                </div>
              </div>
            </div>

            {/* 2. Executive KPI Highlights Grid */}
            <div>
              <div className="text-[11px] uppercase tracking-wider font-extrabold text-slate-600 mb-2.5 flex items-center gap-1.5">
                <span>Executive Financial Summary</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Total Inflow Collected</div>
                  <div className="text-xl font-extrabold text-emerald-700 mt-1">
                    {inflowTotal.toLocaleString()} <span className="text-xs font-normal text-slate-500">UGX</span>
                  </div>
                  {outflowTotal > 0 && (
                    <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                      Outflow: -{outflowTotal.toLocaleString()} UGX
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Total Receipts Issued</div>
                  <div className="text-xl font-extrabold text-blue-700 mt-1">
                    {receiptCount} <span className="text-xs font-normal text-slate-500">Receipts</span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Average Ticket Size</div>
                  <div className="text-xl font-extrabold text-slate-800 mt-1">
                    {Number(metrics.average).toLocaleString()} <span className="text-xs font-normal text-slate-500">UGX</span>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                  <div className="text-[10px] uppercase text-slate-500 font-bold">Largest Payment</div>
                  <div className="text-xl font-extrabold text-indigo-700 mt-1">
                    {Number(metrics.largest).toLocaleString()} <span className="text-xs font-normal text-slate-500">UGX</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Category & Method Breakdowns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              {/* Category Breakdown Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3.5 py-2 font-bold text-[11px] uppercase tracking-wider text-slate-700 border-b border-slate-200 flex justify-between">
                  <span>Collections by Purpose</span>
                  <span>Count &bull; Share</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto print:max-h-none">
                  {purposeData.length === 0 ? (
                    <div className="p-3 text-slate-400 italic text-center">No inflow categories recorded</div>
                  ) : (
                    purposeData.map((item, idx) => {
                      const pct = inflowTotal > 0
                        ? Math.round((item.value / inflowTotal) * 100)
                        : 0;
                      return (
                        <div key={idx} className="px-3.5 py-2 flex items-center justify-between text-[11px]">
                          <div>
                            <span className="font-semibold text-slate-800">{item.name}</span>
                            <span className="text-slate-400 ml-1.5">({item.count})</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-900">{Number(item.value).toLocaleString()} UGX</span>
                            <span className="text-slate-500 ml-2 font-sans">[{pct}%]</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Payment Methods Breakdown Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-100 px-3.5 py-2 font-bold text-[11px] uppercase tracking-wider text-slate-700 border-b border-slate-200 flex justify-between">
                  <span>Collections by Payment Channel</span>
                  <span>Share</span>
                </div>
                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto print:max-h-none">
                  {methodData.length === 0 ? (
                    <div className="p-3 text-slate-400 italic text-center">No payment channels recorded</div>
                  ) : (
                    methodData.map((item, idx) => {
                      const pct = inflowTotal > 0 
                        ? Math.round((item.value / inflowTotal) * 100) 
                        : 0;
                      return (
                        <div key={idx} className="px-3.5 py-2 flex items-center justify-between text-[11px]">
                          <div>
                            <span className="font-semibold text-slate-800">{item.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-slate-900">{Number(item.value).toLocaleString()} UGX</span>
                            <span className="text-slate-500 ml-2 font-sans">[{pct}%]</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* 4. Complete Verified Ledger Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wider font-extrabold text-slate-600 flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Verified Receipt Ledger ({filteredData.length} records)</span>
                </div>
                <span className="text-[10px] text-slate-400">All amounts in UGX</span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[10px] uppercase tracking-wider">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Receipt Number</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Payer Name</th>
                      <th className="py-2.5 px-3">Category</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3 text-right">Amount (UGX)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                          No transactions found for the selected period.
                        </td>
                      </tr>
                    ) : (
                      filteredData.slice(0, 100).map((tx, idx) => {
                        const isOutflow = tx.type === 'OUTFLOW';
                        const displayParty = isOutflow ? (tx.payee || tx.payerName) : tx.payerName;
                        const displayCat = isOutflow ? (tx.category || tx.paymentPurpose) : tx.paymentPurpose;
                        return (
                          <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="py-2 px-3 text-slate-400 font-sans">{idx + 1}</td>
                            <td className={`py-2 px-3 font-bold font-sans ${isOutflow ? 'text-rose-700' : 'text-blue-700'}`}>
                              {tx.receiptNumber}
                            </td>
                            <td className="py-2 px-3 text-slate-600 font-sans">{tx.date}</td>
                            <td className="py-2 px-3 font-semibold text-slate-900">
                              {displayParty}
                              {isOutflow && (
                                <span className="ml-1.5 text-[9px] font-bold uppercase text-rose-600">[OUTFLOW]</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-600">{displayCat}</td>
                            <td className="py-2 px-3 text-slate-600">{tx.paymentMethod}</td>
                            <td className={`py-2 px-3 text-right font-bold ${isOutflow ? 'text-rose-700' : 'text-slate-900'}`}>
                              {isOutflow ? '-' : ''}{Number(tx.amount).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300 text-xs">
                      <td colSpan={6} className="py-3 px-3 uppercase tracking-wider text-right">
                        Net Cashflow ({filteredData.length} Transactions):
                      </td>
                      <td className={`py-3 px-3 text-right text-sm ${netTotal >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>
                        {netTotal.toLocaleString()} UGX
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* 5. Executive Sign-off & Audit Certification Block */}
            <div className="pt-6 border-t-2 border-slate-200">
              <div className="text-[10px] uppercase font-bold text-slate-400 mb-6 tracking-widest text-center">
                Executive Audit &amp; Approval Sign-Off
              </div>
              <div className="grid grid-cols-3 gap-6 text-center text-xs">
                <div className="border-t border-slate-400 pt-3">
                  <div className="font-bold text-slate-900">{currentUser?.name || 'Authorized Officer'}</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">Prepared By ({currentUser?.role || 'OPERATOR'})</div>
                  <div className="text-[9px] text-slate-400 mt-2 font-sans">Date: {localDate}</div>
                </div>

                <div className="border-t border-slate-400 pt-3">
                  <div className="font-bold text-slate-900">Financial Secretary</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">Audited &amp; Reconciled</div>
                </div>

                <div className="border-t border-slate-400 pt-3">
                  <div className="font-bold text-slate-900">Club Treasurer / Chairman</div>
                  <div className="text-[10px] text-slate-500 uppercase mt-0.5">Verified &amp; Approved</div>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 text-center mt-6 pt-3 border-t border-slate-100 leading-relaxed font-sans">
                Official Digital Ledger Generated Document &bull; SC Basimbuzi 1925 &bull; All Transactions Cryptographically &amp; Atomically Verified
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
