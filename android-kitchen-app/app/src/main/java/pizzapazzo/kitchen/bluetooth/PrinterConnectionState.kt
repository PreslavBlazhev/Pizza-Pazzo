package pizzapazzo.kitchen.bluetooth

/** Connection lifecycle reported to the settings screen and the JS bridge. */
enum class PrinterConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    PRINTING,
    ERROR,
}
