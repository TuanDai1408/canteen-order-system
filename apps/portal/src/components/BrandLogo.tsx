import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: number | string;
  height?: number | string;
  showText?: boolean;
  subTitle?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  className = '',
  size,
  height = 48,
  showText = false,
  subTitle = 'ĂN SẠCH – SỐNG KHỎE',
}) => {
  const actualHeight = size !== undefined
    ? (typeof size === 'number' ? size : parseInt(String(size), 10) || 48)
    : (typeof height === 'number' ? height : parseInt(String(height), 10) || 48);

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/logo.svg"
        alt="Cơm Ngon SIBA - Ăn Sạch Sống Khỏe"
        style={{ height: `${actualHeight}px`, width: 'auto' }}
        className="shrink-0 object-contain select-none transition-transform hover:scale-105"
      />

      {showText && (
        <div className="flex flex-col">
          <span className="font-extrabold text-base tracking-tight text-slate-900 leading-tight">
            <span className="text-red-600">Cơm Ngon </span>
            <span className="text-red-700 font-black">SIBA</span>
          </span>
          {subTitle && (
            <span className="text-[10px] font-bold text-red-600/90 tracking-wider uppercase leading-none mt-0.5">
              {subTitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
