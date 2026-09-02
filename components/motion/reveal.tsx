"use client";
import { motion } from "motion/react";

export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.2, 0.7, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
