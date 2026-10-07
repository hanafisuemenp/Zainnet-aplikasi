import React from 'react';
import { 
  ChevronDown, 
  ChevronUp,
  Sparkles, 
  Crown,
  Wrench
} from 'lucide-react';
import { ToolCategory, ToolItem, UserRole, MaintenanceConfig, ToolMaintenanceItem } from '../types';
import { ToolCard } from './ToolCard';
import { CheckoutTarget } from './ManualQrisPaymentModal';
import { calculateEffectivePrice } from '../data/toolsData';

interface CategorySectionProps {
  category: ToolCategory;
  isOpen: boolean;
  onToggle: (id: number) => void;
  favorites: Set<string>;
  getToolQuota: (tool: ToolItem) => number;
  getResellerTrialRemaining?: (toolId: string) => number;
  userRole?: UserRole;
  discountPercentage?: number;
  freeRewardsAvailable?: number;
  isFreeTrialEligible?: boolean;
  maintenanceConfig?: MaintenanceConfig;
  userId?: string;
  onOpenTool: (tool: ToolItem) => void;
  onToggleFavorite: (toolId: string) => void;
  onCheckoutRequest: (target: CheckoutTarget) => void;
  onClaimReward?: (tool: ToolItem) => void;
  onClaimFreeTrial?: (tool: ToolItem) => void;
  onOpenMaintenanceNotice?: (tool: ToolItem, maintenanceInfo?: ToolMaintenanceItem) => void;
  onQuickManageMaintenance?: (tool: ToolItem) => void;
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  isOpen,
  onToggle,
  favorites,
  getToolQuota,
  getResellerTrialRemaining,
  userRole = 'public',
  discountPercentage = 50,
  freeRewardsAvailable = 0,
  isFreeTrialEligible = false,
  maintenanceConfig,
  userId,
  onOpenTool,
  onToggleFavorite,
  onCheckoutRequest,
  onClaimReward,
  onClaimFreeTrial,
  onOpenMaintenanceNotice,
  onQuickManageMaintenance
}) => {
  const isAdmin = userRole === 'admin';
  const isReseller = userRole === 'reseller';
  const effectivePackagePrice = calculateEffectivePrice(category.packagePriceRp, userRole, discountPercentage);
  const totalCategoryTrials = isReseller && getResellerTrialRemaining
    ? category.tools.reduce((sum, t) => sum + getResellerTrialRemaining(t.id), 0)
    : 0;
  const allToolsHaveQuota = isAdmin || category.tools.every((t) => getToolQuota(t) > 0);

  // Count tools in maintenance
  const maintenanceCount = category.tools.filter(
    t => maintenanceConfig?.items?.[t.id]?.status && maintenanceConfig.items[t.id].status !== 'active'
  ).length;

  return (
    <div 
      id={`section-${category.id}`}
      className={`rounded-3xl border transition-all duration-300 overflow-hidden ${
        isOpen
          ? 'bg-[#141c2e] border-slate-700/80 shadow-xl shadow-black/30'
          : 'bg-[#141c2e]/90 border-[#1f293d] hover:border-slate-700/80'
      }`}
    >
      {/* Accordion Header Button */}
      <button
        type="button"
        onClick={() => onToggle(category.id)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 p-4 sm:p-5 text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {/* Category Number Badge */}
          <div className={`w-12 h-12 min-w-12 rounded-2xl flex items-center justify-center font-extrabold text-lg sm:text-xl text-white shadow-md shrink-0 ${
            isAdmin
              ? 'bg-amber-500 text-black'
              : 'bg-blue-600'
          }`}>
            {category.number}
          </div>

          {/* Category Info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-bold text-base sm:text-lg text-white tracking-tight">
                {category.title}
              </h2>
              {isAdmin && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-400" />
                  <span>Admin</span>
                </span>
              )}
              {maintenanceCount > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                  <Wrench className="w-2.5 h-2.5" />
                  <span>{maintenanceCount} Modul Perbaikan</span>
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5 truncate">
              {category.subtitle || `${category.tools.length} tools untuk ${category.title.toLowerCase()}`}
            </p>
          </div>
        </div>

        {/* Arrow Toggle Indicator */}
        <div className={`w-10 h-10 min-w-10 rounded-xl flex items-center justify-center transition-all duration-200 shrink-0 ${
          isOpen
            ? 'bg-blue-600 text-white shadow-md'
            : 'bg-[#202b42] text-white hover:bg-[#283550]'
        }`}>
          {isOpen ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </button>

      {/* Accordion Content */}
      <div 
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen ? 'max-h-[1400px] opacity-100 px-4 sm:px-5 pb-4 sm:pb-5 pt-1' : 'max-h-0 opacity-0 px-4 sm:px-5 py-0 pointer-events-none'
        }`}
      >
        {/* List of tools in this category */}
        <div className="flex flex-col gap-2.5">
          {category.tools.map((tool) => {
            const quota = getToolQuota(tool);
            const resellerTrialRemaining = getResellerTrialRemaining ? getResellerTrialRemaining(tool.id) : 0;
            const isUnlocked = isAdmin || quota > 0 || (isReseller && resellerTrialRemaining > 0);
            const maintenanceInfo = maintenanceConfig?.items?.[tool.id];

            return (
              <ToolCard
                key={tool.id}
                tool={tool}
                isFavorite={favorites.has(tool.id)}
                isUnlocked={isUnlocked}
                quota={quota}
                resellerTrialRemaining={resellerTrialRemaining}
                userRole={userRole}
                discountPercentage={discountPercentage}
                freeRewardsAvailable={freeRewardsAvailable}
                isFreeTrialEligible={isFreeTrialEligible}
                maintenanceInfo={maintenanceInfo}
                userId={userId}
                onOpen={onOpenTool}
                onToggleFavorite={onToggleFavorite}
                onClaimReward={onClaimReward}
                onClaimFreeTrial={onClaimFreeTrial}
                onOpenMaintenanceNotice={onOpenMaintenanceNotice}
                onQuickManageMaintenance={onQuickManageMaintenance}
                onUnlockRequest={(targetTool, effectivePrice) => onCheckoutRequest({
                  type: 'tool',
                  id: targetTool.id,
                  title: `1x Pembuatan: ${targetTool.title}`,
                  subtitle: `Pembayaran & kuota khusus untuk link ini (${targetTool.title}) — Dihitung per tiap link (Bukan per nomor ${category.number})`,
                  priceRp: effectivePrice,
                  originalPriceRp: targetTool.priceRp,
                  badge: isReseller ? 'Diskon Reseller 50%' : targetTool.badge,
                  mayarPaymentUrl: targetTool.mayarPaymentUrl || category.mayarPaymentUrl
                })}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};


