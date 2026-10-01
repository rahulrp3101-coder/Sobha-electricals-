import React from 'react';
import { ShoppingBag, Package, Users, Settings, Building2 } from 'lucide-react';
import { MainTab } from './Header';

interface BottomNavProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  lowStockCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  lowStockCount = 0,
}) => {
  const navItems = [
    {
      id: 'POS' as MainTab,
      label: 'Billing',
      sublabel: 'बिलिंग',
      icon: ShoppingBag,
    },
    {
      id: 'PURCHASES' as MainTab,
      label: 'Purchases',
      sublabel: 'खरीद',
      icon: Building2,
    },
    {
      id: 'INVENTORY' as MainTab,
      label: 'Inventory',
      sublabel: 'स्टॉक',
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
    },
    {
      id: 'PARTIES' as MainTab,
      label: 'Customers',
      sublabel: 'खाता',
      icon: Users,
    },
    {
      id: 'SETTINGS' as MainTab,
      label: 'Settings',
      sublabel: 'सेटिंग्स',
      icon: Settings,
    },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-40 md:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.08)] select-none safe-area-pb">
      <div className="grid grid-cols-5 h-16 items-center px-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`flex flex-col items-center justify-center h-full relative transition active:scale-95 ${
                isActive
                  ? 'text-blue-700 font-extrabold'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              {/* Active top indicator pip */}
              {isActive && (
                <span className="absolute top-0 w-8 h-1 bg-blue-700 rounded-b-full shadow-xs" />
              )}

              <div className="relative">
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${isActive ? 'stroke-[2.5px] scale-110 text-blue-700' : 'stroke-[1.8px]'}`} />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 bg-red-600 text-white text-[9px] font-black rounded-full h-3.5 min-w-3.5 px-0.5 flex items-center justify-center animate-pulse shadow-2xs">
                    {item.badge}
                  </span>
                )}
              </div>

              <span className="text-[10px] sm:text-[11px] mt-1 leading-tight tracking-tight text-center truncate max-w-full px-0.5 font-bold">
                {item.label}
              </span>
              <span className="text-[8px] text-slate-400 -mt-0.5">
                {item.sublabel}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
