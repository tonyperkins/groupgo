import { CSSProperties, ReactNode } from "react";

interface ScrollAreaProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function ScrollArea({ children, style }: ScrollAreaProps) {
  return (
    <div style={{
      flex: 1, minHeight: 0,
      overflowY: "auto", overflowX: "hidden",
      scrollbarWidth: "none",
      ...style,
    }}>
      <style>{`::-webkit-scrollbar { display: none; }`}</style>
      <div style={{ paddingTop: 2 }}>
        {children}
      </div>
    </div>
  );
}
