#ifndef __Nifti__
#define __Nifti__

#include "nifti1.h"

void Nifti_load(char *path, char **addr,int *sz, int *swapped);
void Nifti_save(char *path, char *addr);

#endif