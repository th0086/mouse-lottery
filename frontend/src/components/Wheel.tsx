"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  latestNumber?: number;
  isSpinning: boolean;
};

export function Wheel({ latestNumber, isSpinning }: Props) {
  const animationIdRef = useRef<number>();
  const lastHandledNumberRef = useRef<number | null>(null);
  const resumeAtRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const [currentRotation, setCurrentRotation] = useState(0);
  const [stoppedNumber, setStoppedNumber] = useState<number | null>(null);

  // 當新數字進來時，停止轉盤
  useEffect(() => {
    if (latestNumber === undefined) {
      return;
    }

    // 首次載入時只記錄當前數字，不觸發停盤。
    if (lastHandledNumberRef.current === null) {
      lastHandledNumberRef.current = latestNumber;
      return;
    }

    if (latestNumber !== lastHandledNumberRef.current) {
      lastHandledNumberRef.current = latestNumber;
      setStoppedNumber(latestNumber);
      resumeAtRef.current = performance.now() + 3000;
    }
  }, [latestNumber]);

  // 動畫循環
  useEffect(() => {
    if (!isSpinning) {
      return;
    }

    const speedDegPerSecond = 400;

    const animate = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }

      const deltaSec = Math.min((timestamp - (lastFrameTimeRef.current ?? timestamp)) / 1000, 0.05);
      lastFrameTimeRef.current = timestamp;

      if (stoppedNumber !== null && resumeAtRef.current !== null) {
        if (timestamp >= resumeAtRef.current) {
          setStoppedNumber(null);
          resumeAtRef.current = null;
        }
      }

      if (stoppedNumber === null) {
        setCurrentRotation((prev) => (prev + speedDegPerSecond * deltaSec) % 360);
      }

      animationIdRef.current = requestAnimationFrame(animate);
    };

    animationIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      lastFrameTimeRef.current = null;
    };
  }, [isSpinning, stoppedNumber]);

  // 計算停止位置
  useEffect(() => {
    if (stoppedNumber !== undefined && stoppedNumber !== null) {
      // Figma 輪盤以 0 在頂部為基準，順時針每格 36 度。
      const targetRotation = (360 - stoppedNumber * 36) % 360;
      setCurrentRotation(targetRotation);
    }
  }, [stoppedNumber]);

  return (
    <div className="wheel-shell">
      <div className="wheel-stage-layout wheel-stage-layout--figma">
        <div className="wheel-board">
          <div className="wheel-pointer" aria-hidden="true">
            <span className="wheel-pointer-overlay" />
            <span className="wheel-pointer-glow" />
          </div>
          <div className="wheel-rotor" style={{ transform: `rotate(${currentRotation}deg)` }}>
            <img src="/wheel_disc_2731.png" alt="" className="wheel-disc-image" draggable={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
