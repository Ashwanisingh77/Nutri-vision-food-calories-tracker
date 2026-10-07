'use client';

import { motion } from 'framer-motion';

interface ScannerOverlayProps {
  imageUrl: string;
  statusMessage?: string;
}

export default function ScannerOverlay({ imageUrl, statusMessage }: ScannerOverlayProps) {
  return (
    <div className="relative w-full aspect-square rounded-2xl overflow-hidden">
      {/* Food image */}
      <img
        src={imageUrl}
        alt="Food being scanned"
        className="w-full h-full object-cover"
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Scan line */}
      <motion.div
        className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee]"
        animate={{ top: ['10%', '90%', '10%'] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      />

      {/* Corner brackets */}
      {[
        'top-3 left-3 border-t-2 border-l-2 rounded-tl-lg',
        'top-3 right-3 border-t-2 border-r-2 rounded-tr-lg',
        'bottom-3 left-3 border-b-2 border-l-2 rounded-bl-lg',
        'bottom-3 right-3 border-b-2 border-r-2 rounded-br-lg',
      ].map((classes, i) => (
        <motion.div
          key={i}
          className={`absolute w-8 h-8 border-cyan-400 ${classes}`}
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        />
      ))}

      {/* Rotating outer ring */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="w-32 h-32 rounded-full border-2 border-transparent border-t-cyan-400 border-r-cyan-400/50"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Center pulsing dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="w-3 h-3 rounded-full bg-cyan-400"
          animate={{ scale: [1, 1.8, 1], opacity: [1, 0.3, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      </div>

      {/* Status bar at bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-cyan-300 font-mono">
            {statusMessage || 'Analyzing...'}
          </span>
          <motion.div
            className="w-2 h-2 rounded-full bg-cyan-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        </div>
        {/* Indeterminate progress bar */}
        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full"
            style={{ width: '30%' }}
            animate={{ x: ['-100%', '400%'] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* Particle dots */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-cyan-400"
          style={{
            left: `${15 + i * 14}%`,
            top: `${20 + (i % 3) * 25}%`,
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            delay: i * 0.25,
          }}
        />
      ))}
    </div>
  );
}
