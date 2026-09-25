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
  height = 36,
  showText = true,
  subTitle = 'Ăn sạch Sống khỏe',
}) => {
  const actualHeight =
    size !== undefined
      ? typeof size === 'number'
        ? size
        : parseInt(String(size), 10) || 36
      : typeof height === 'number'
      ? height
      : parseInt(String(height), 10) || 36;

  return (
    <div className={`inline-flex items-center gap-2 select-none ${className}`}>
      <img
        src="/logo-icon.svg"
        alt="Cơm Ngon SIBA"
        style={{ height: `${actualHeight}px`, width: 'auto' }}
        className="shrink-0 object-contain transition-transform duration-200 hover:scale-105"
      />

      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <span className="font-extrabold text-sm sm:text-base tracking-tight text-[#ED1C24] font-sans">
            Cơm Ngon <span className="font-black">SIBA</span>
          </span>
          {subTitle && (
            <span className="text-[10px] sm:text-[11px] font-bold text-[#ED1C24] tracking-tight mt-0.5 font-sans whitespace-nowrap">
              {subTitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
