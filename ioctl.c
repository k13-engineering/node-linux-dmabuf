#include <stdio.h>
#include <sys/ioctl.h>
#include <linux/dma-heap.h>

int main() {
    printf("DMA_HEAP_IOCTL_ALLOC: 0x%lx\n", DMA_HEAP_IOCTL_ALLOC);
    return 0;
}
