import { useRef, useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TruncatedTextProps {
  text: string;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
}

/**
 * 텍스트가 실제로 잘릴 때(...)만 마우스 hover 시 전체 내용을
 * 즉시(딜레이 없이) 예쁜 툴팁으로 보여준다.
 * - open 제어는 Radix에 맡기고(깜빡임 방지), 잘림 여부만 hover 시점에 측정.
 */
export function TruncatedText({ text, className, side = "top" }: TruncatedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          ref={ref}
          className={cn("truncate", className)}
          onMouseEnter={() => {
            const el = ref.current;
            setShow(!!el && el.scrollWidth > el.clientWidth + 1);
          }}
        >
          {text}
        </span>
      </TooltipTrigger>
      {show && (
        <TooltipContent side={side} className="max-w-xs break-words whitespace-normal">
          {text}
        </TooltipContent>
      )}
    </Tooltip>
  );
}
