"use client";

import { useState } from "react";
import { PoolList } from "@/components/pools";
import { CreatePoolModal } from "@/components/pools/CreatePoolModal";

export default function PoolsPage() {
  const [showCreatePool, setShowCreatePool] = useState(false);

  return (
    <div className="container mx-auto px-4 py-8">
      <PoolList onCreatePool={() => setShowCreatePool(true)} />

      <CreatePoolModal
        isOpen={showCreatePool}
        onClose={() => setShowCreatePool(false)}
      />
    </div>
  );
}
