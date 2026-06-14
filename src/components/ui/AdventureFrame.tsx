import React from 'react';

interface AdventureFrameProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'radar' | 'card' | 'next' | 'hud';
}

export function AdventureFrame({ 
  children, 
  className = '', 
  variant = 'default' 
}: AdventureFrameProps) {
  const baseClasses = `
    relative 
    border-2 border-[#f97316] 
    bg-black/70 
    p-3 
    overflow-hidden
    font-mono
    text-white
    shadow-[0_0_15px_rgba(249,115,22,0.3)]
  `;

  const cornerClasses = `
    absolute w-4 h-4 border-[#fde047]
    before:content-[''] before:absolute before:bg-[#fde047] before:rounded-full
  `;

  const circuitClasses = `
    before:absolute before:inset-0 
    before:bg-[linear-gradient(90deg,#f97316_1px,transparent_1px),linear-gradient(180deg,#f97316_1px,transparent_1px)] 
    before:bg-[length:12px_12px] 
    before:opacity-[0.08] 
    before:pointer-events-none
  `;

  const hudInner = `
    before:absolute before:inset-[3px] 
    before:border before:border-[#f97316]/30 
    before:pointer-events-none
  `;

  const variantClasses = {
    default: '',
    radar: 'border-[#f97316] bg-black/80',
    card: 'border-[#f97316]/80 p-2',
    next: 'border-[#f97316] bg-black/90 p-1',
    hud: 'border-[#f97316] p-4',
  };

  return (
    <div className={`${baseClasses} ${circuitClasses} ${hudInner} ${variantClasses[variant]} ${className}`}>
      {/* Tech corners - orange/yellow HUD */}
      <div className={`${cornerClasses} top-0 left-0 border-t-2 border-l-2`} />
      <div className={`${cornerClasses} top-0 right-0 border-t-2 border-r-2`} />
      <div className={`${cornerClasses} bottom-0 left-0 border-b-2 border-l-2`} />
      <div className={`${cornerClasses} bottom-0 right-0 border-b-2 border-r-2`} />
      
      {/* Inner HUD line */}
      <div className="absolute inset-[1px] border border-[#f97316]/20 pointer-events-none" />
      
      {/* Subtle chip circuitry accent lines */}
      <div className="absolute top-2 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-[#fde047]/30 to-transparent" />
      <div className="absolute bottom-2 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-[#fde047]/30 to-transparent" />
      
      {children}
    </div>
  );
}
