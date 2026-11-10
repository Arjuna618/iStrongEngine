import React, { createContext, useContext } from 'react';

const ScrollAreaCtx = createContext(false);

interface ScrollAreaProps {
  className?: string;
  contentClassName?: string;
  overlay?: React.ReactNode;
  children: React.ReactNode;
}

export const ScrollArea: React.FC<ScrollAreaProps> = ({
  className = '',
  contentClassName = '',
  overlay,
  children,
}) => {
  const nested = useContext(ScrollAreaCtx);

  if (nested) {
    return <div className={`min-h-0 ${contentClassName} ${className}`}>{children}</div>;
  }

  return (
    <ScrollAreaCtx.Provider value={true}>
      <div className={`relative flex flex-col min-h-0 h-full ${className}`}>
        {overlay}
        <div className={`flex-1 min-h-0 overflow-y-auto tool-scrollbar ${contentClassName}`}>
          {children}
        </div>
      </div>
    </ScrollAreaCtx.Provider>
  );
};
