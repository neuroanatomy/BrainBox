#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "Nifti.h"

int NiftiBytesPerVoxel(nifti_1_header hdr)
{
	int	bpv=0;
	
	switch(hdr.datatype)
	{	case DT_UINT8:		bpv=1; break;
		case DT_INT16:		bpv=2; break;
		case DT_INT32:		bpv=4; break;
		case DT_FLOAT32:	bpv=4; break;
		case DT_COMPLEX64:	bpv=8; break;
		case DT_FLOAT64:	bpv=8; break;
		case DT_RGB24:		bpv=3; break;
		case DT_INT8:		bpv=1; break;
		case DT_UINT16:		bpv=2; break;
		case DT_UINT32:		bpv=4; break;
		case DT_INT64:		bpv=8; break;
		case DT_UINT64:		bpv=8; break;
		case DT_FLOAT128:	bpv=16; break;
		case DT_COMPLEX128:	bpv=16; break;
		case DT_COMPLEX256:	bpv=32; break;
		case DT_RGBA32:		bpv=4; break;
	}
	
	return bpv;
}
void Nifti_load(char *path, char **addr,int *sz, int *swapped)
{
	nifti_1_header	hdr;
	FILE	*f;
	int		size;

	f=fopen(path,"r");
	if(f==NULL){printf("ERROR: Cannot open Nifti file for loading\n");return;}
	
	fread(&hdr,sizeof(hdr),sizeof(char),f);
	*swapped=0;
	if(hdr.sizeof_hdr!=348) // different endianness
	{
		//swap_hdr(hdr);
		*swapped=1;
		printf("ERROR: Cannot open Nifti files with Motorola endianess\n");
	}
	if(hdr.dim[1]==3 && hdr.dim[4]>1)
		size=hdr.dim[2]*hdr.dim[3]*hdr.dim[4];
	else
		size=hdr.dim[1]*hdr.dim[2]*hdr.dim[3];

	*sz=size*NiftiBytesPerVoxel(hdr)+sizeof(hdr);
	*addr=calloc(*sz,1);
	memcpy(*addr,&hdr,sizeof(hdr));
	
	fseek(f, hdr.vox_offset-sizeof(hdr),SEEK_CUR);
	
	fread(*addr+sizeof(hdr),size,NiftiBytesPerVoxel(hdr),f);
	fclose(f);

	/*
	if(*swapped)	// different endianness
		swap_img(img,hdr);
	 */
}
void Nifti_save(char *path, char *addr)
{
	nifti_1_header	*hdr;
	FILE	*f;
	int		size;
	char	extension[4]={0,0,0,0};
	
	hdr=(nifti_1_header*)addr;

	if(hdr->dim[1]==3 && hdr->dim[4]>1)
		size=hdr->dim[2]*hdr->dim[3]*hdr->dim[4];
	else
		size=hdr->dim[1]*hdr->dim[2]*hdr->dim[3];

	hdr->vox_offset=352;
    if(hdr->scl_slope==0)
    {
        hdr->scl_inter=0;
        hdr->scl_slope=1;
    }
	f=fopen(path,"w");
	if(f==NULL){printf("ERROR: Cannot open Nifti file for saving\n");return;}
	fwrite(addr,sizeof(*hdr),1,f);
	fwrite(extension,4,1,f);
	fwrite(addr+sizeof(*hdr),size,NiftiBytesPerVoxel(*hdr),f);
	fclose(f);
}
