import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number | string;
  showText?: boolean;
  subTitle?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size = 40,
  showText = false,
  subTitle = 'Bếp ăn Đại Học Hùng Vương',
}) => {
  const numSize = typeof size === 'number' ? size : parseInt(String(size), 10) || 40;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/logo.svg"
        alt="A.KITCHEN Logo"
        width={numSize}
        height={numSize}
        style={{ width: `${numSize}px`, height: `${numSize}px` }}
        className="shrink-0 object-contain select-none drop-shadow-xs"
      />

      {showText && (
        <div className="flex flex-col">
          <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 leading-tight">
            <span className="text-orange-600">A.</span>
            <span className="text-emerald-700">KITCHEN</span>
          </span>
          {subTitle && (
            <span className="text-[11px] font-semibold text-slate-500 leading-none mt-0.5">
              {subTitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
