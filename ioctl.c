#include <stdio.h>
#include <sys/ioctl.h>
#include <linux/dma-heap.h>
#include <fcntl.h>

int main() {
    printf("DMA_HEAP_IOCTL_ALLOC: 0x%lx\n", DMA_HEAP_IOCTL_ALLOC);
    printf("O_RDWR: 0x%x\n", O_RDWR);
    printf("O_CLOEXEC: 0x%x\n", O_CLOEXEC);
    return 0;
}
