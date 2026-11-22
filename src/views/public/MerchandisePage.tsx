import React, { useState } from 'react';
import { resolveClubImageUrl } from '../../assets/clubImages';
import { ClubMerchItem } from '../../types';
import { openWhatsAppChat } from '../../utils/whatsappReceipt';
import { ArrowLeft, ShoppingBag } from 'lucide-react';

interface MerchandisePageProps {
  clubName: string;
  clubPhone: string;
  merch: ClubMerchItem[];
  onBackHome: () => void;
}

export const MerchandisePage: React.FC<MerchandisePageProps> = ({
  clubName,
  clubPhone,
  merch,
  onBackHome
}) => {
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});

  const handleOrderMerch = (item: ClubMerchItem, chosenSize: string) => {
    const message = `Hello ${clubName}, I would like to order:\n\n• Item: ${item.name}\n• Size: ${chosenSize}\n• Price: ${Number(item.priceUgx).toLocaleString()} UGX\n\nPlease share payment and pickup/delivery details.`;
    openWhatsAppChat(clubPhone || '+256700000000', message);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-8 py-10 sm:py-14 space-y-10">
      <div className="space-y-4">
        <button
          type="button"
          onClick={onBackHome}
          className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Club Home</span>
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              Official Club Store · {clubName}
            </p>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white mt-1">
              Supporter Kit &amp; Merchandise
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-2 max-w-2xl">
              Support {clubName} in official colours. Select your preferred size and place your order directly via the club WhatsApp desk.
            </p>
          </div>
        </div>
      </div>

      {(merch || []).length === 0 ? (
        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 p-14 text-center space-y-3">
          <ShoppingBag className="w-10 h-10 text-slate-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Club Store Restocking</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            New jerseys and supporter apparel will be listed here soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(merch || []).map(item => {
            const sizes = item.sizes && item.sizes.length > 0 ? item.sizes : ['S', 'M', 'L', 'XL'];
            const chosenSize = selectedSizes[item.id] || sizes[0] || 'M';

            return (
              <article
                key={item.id}
                className="border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-[4/3] bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
                    <img
                      src={resolveClubImageUrl(item.imageUrl, 'preset:jersey')}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-bold text-slate-950 dark:text-white leading-snug">
                        {item.name}
                      </h2>
                      <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap tabular-nums">
                        {Number(item.priceUgx).toLocaleString()} UGX
                      </span>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.description}
                    </p>

                    <div>
                      <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
                        Select Size
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sizes.map(sz => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setSelectedSizes(prev => ({ ...prev, [item.id]: sz }))}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                              chosenSize === sz
                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-950 border-slate-900 dark:border-white'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                            }`}
                          >
                            {sz}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <button
                    type="button"
                    disabled={!item.inStock}
                    onClick={() => handleOrderMerch(item, chosenSize)}
                    className="w-full py-3 px-4 bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    {item.inStock ? `Order via WhatsApp (Size ${chosenSize})` : 'Currently Out of Stock'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
};
