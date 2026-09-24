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
}) => {
  const actualHeight =
    size !== undefined
      ? typeof size === 'number'
        ? size
        : parseInt(String(size), 10) || 48
      : typeof height === 'number'
      ? height
      : parseInt(String(height), 10) || 48;

  return (
    <div className={`inline-flex items-center select-none ${className}`}>
      <img
        src="/logo.svg"
        alt="Cơm Ngon SIBA - Ăn sạch Sống khỏe"
        style={{ height: `${actualHeight}px`, width: 'auto' }}
        className="shrink-0 object-contain transition-transform duration-200 hover:scale-[1.02]"
      />
    </div>
  );
};
