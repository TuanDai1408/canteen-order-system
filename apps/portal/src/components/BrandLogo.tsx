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
  subTitle = 'ĂN SẠCH – SỐNG KHỎE',
}) => {
  const numSize = typeof size === 'number' ? size : parseInt(String(size), 10) || 40;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/logo.svg"
        alt="Cơm Ngon SIBA Logo"
        width={numSize}
        height={numSize}
        style={{ width: `${numSize}px`, height: `${numSize}px` }}
        className="shrink-0 object-contain select-none drop-shadow-xs"
      />

      {showText && (
        <div className="flex flex-col">
          <span className="font-extrabold text-sm sm:text-base tracking-tight text-slate-900 leading-tight">
            <span className="text-red-600">Cơm Ngon </span>
            <span className="text-red-700 font-black">SIBA</span>
          </span>
          {subTitle && (
            <span className="text-[10px] sm:text-[11px] font-bold text-red-600/80 tracking-wider uppercase leading-none mt-0.5">
              {subTitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
