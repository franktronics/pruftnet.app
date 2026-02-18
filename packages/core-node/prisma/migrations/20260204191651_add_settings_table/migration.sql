-- CreateTable
CREATE TABLE "Settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "maxPacketBufferSize" INTEGER NOT NULL,
    "promiscuousMode" BOOLEAN NOT NULL,
    "protocolEntryFile" TEXT NOT NULL,
    "defaultCaptureTab" TEXT NOT NULL,
    "connectionLineType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
