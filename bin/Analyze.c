/*
 *  Analyze.c
 *
 *  Created by rOBERTO tORO on 06/04/2006.
 *  Copyright 2006 __MyCompanyName__. All rights reserved.
 *
 */

#include "Analyze.h"

void Analyze_load(char *path, char **addr,int *sz, int *swapped)
{
	AnalyzeHeader	hdr;
	
	Analyze_load_hdr(path,&hdr,swapped);
	if(hdr.dim[1]==3 && hdr.dim[4]>1) // detect DTI volume
		*sz=hdr.dim[2]*hdr.dim[3]*hdr.dim[4]*bytesPerVoxel(hdr)+sizeof(hdr);
	else
		*sz=hdr.dim[1]*hdr.dim[2]*hdr.dim[3]*bytesPerVoxel(hdr)+sizeof(hdr);

	*addr=calloc(*sz,1);
	memcpy(*addr,&hdr,sizeof(hdr));
	Analyze_load_img(path,hdr,&((*addr)[sizeof(hdr)]));
}
void Analyze_load_hdr(char *path, AnalyzeHeader *hdr, int *swapped)
{
	FILE	*f;
	int		sz;

	sz=sizeof(AnalyzeHeader);

	f=fopen(path,"r");
	if(f)
	{
		fread(hdr,sz,sizeof(char),f);
		if(f==NULL) return;
		
		*swapped=0;
		if(hdr->sizeof_hdr!=348) // different endianness
		{
			swap_hdr(hdr);
			*swapped=1;
		}
	}
	fclose(f);
}
void Analyze_load_img(char *origPath, AnalyzeHeader hdr, char *img)
{
	char	path[512];
	int		len;
	int		sz;
	FILE	*f;
	
	if(hdr.dim[1]==3 && hdr.dim[4]>1)
		sz=hdr.dim[2]*hdr.dim[3]*hdr.dim[4];
	else
		sz=hdr.dim[1]*hdr.dim[2]*hdr.dim[3];
	
	strcpy(path,origPath);
	len=strlen(path);
	path[len-3]='i';
	path[len-2]='m';
	path[len-1]='g';

	f=fopen(path,"r");
	if(f)
	{
		fread(img,sz,bytesPerVoxel(hdr),f);
		if(hdr.sizeof_hdr!=348)	// different endianness
			swap_img(img,hdr);
	}
	fclose(f);
}
void Analyze_save_hdr(char *path, AnalyzeHeader hdr)
{
	FILE	*f;
	int		sz;
	
	sz=sizeof(AnalyzeHeader);

	f=fopen(path,"w");
	if(f)
		fwrite(&hdr,sz,sizeof(char),f);
	fclose(f);
}
void Analyze_save_img(char *origPath, AnalyzeHeader hdr, char *img)
{
	char	path[512];
	int		len;
	int		sz=hdr.dim[1]*hdr.dim[2]*hdr.dim[3];
	FILE	*f;
	
	strcpy(path,origPath);
	len=strlen(path);
	path[len-3]='i';
	path[len-2]='m';
	path[len-1]='g';

	f=fopen(path,"w");
	if(f)
		fwrite(img,sz,bytesPerVoxel(hdr),f);
	fclose(f);
}
int bytesPerVoxel(AnalyzeHeader hdr)
{
	int	bpv=0;

	switch(hdr.datatype)
	{
		case UCHAR:		bpv=1;	break;
		case SHORT:		bpv=2;	break;
		case INT:		bpv=4;	break;
		case FLOAT:		bpv=4;	break;
		case RGB:		bpv=3;	break;
		case RGBFLOAT:	bpv=12;	break;
	}
	
	return bpv;
}
#pragma mark -

void swap_hdr(AnalyzeHeader *hdr)
{
	int		i;
	
    // header key
	swap_int(&(*hdr).sizeof_hdr);
	swap_int(&(*hdr).extents);
	swap_short(&(*hdr).session_error);
	
	// image dimension
	for(i=0;i<8;i++) swap_short(&(*hdr).dim[i]);
	for(i=0;i<7;i++) swap_short(&(*hdr).unused[i]);
	swap_short(&(*hdr).datatype);
	swap_short(&(*hdr).bitpix);
	swap_short(&(*hdr).dim_un0);
	for(i=0;i<8;i++) swap_float(&(*hdr).pixdim[i]);
	swap_float(&(*hdr).vox_offset);
	for(i=0;i<3;i++) swap_float(&(*hdr).funused[i]);
	swap_float(&(*hdr).cal_max);
	swap_float(&(*hdr).cal_min);
	swap_float(&(*hdr).compressed);
	swap_float(&(*hdr).verified);
	swap_int(&(*hdr).glmax);
	swap_int(&(*hdr).glmin);
	
	// data history
	for(i=0;i<3;i++) swap_short(&(*hdr).orig[i]);
	swap_int(&(*hdr).views);
	swap_int(&(*hdr).vols_added);
	swap_int(&(*hdr).start_field);
	swap_int(&(*hdr).field_skip);
	swap_int(&(*hdr).omax);
	swap_int(&(*hdr).omin);
	swap_int(&(*hdr).smax);
	swap_int(&(*hdr).smin);
}
void swap_img(char *img, AnalyzeHeader hdr)
{
	int		i,sz=hdr.dim[1]*hdr.dim[2]*hdr.dim[3];
	
	switch(hdr.datatype)
	{
		case UCHAR:		break;
		case SHORT:		for(i=0;i<sz;i++) swap_short(&((short*)img)[i]);		break;
		case INT:		for(i=0;i<sz;i++) swap_int(&((int*)img)[i]);			break;
		case FLOAT:		for(i=0;i<sz;i++) swap_float(&((float*)img)[i]);		break;
		case RGBFLOAT:	for(i=0;i<sz;i++) swap_rgbfloat(&((float*)img)[i]);		break;
	}
}	
void swap_short(short *v)
{
	unsigned char	b[2];
	
	b[0]=((unsigned char*)v)[1];
	b[1]=((unsigned char*)v)[0];
	*v=*(short*)b;
}
void swap_int(int *v)
{
	unsigned char	b[4];
	
	b[0]=((unsigned char*)v)[3];
	b[1]=((unsigned char*)v)[2];
	b[2]=((unsigned char*)v)[1];
	b[3]=((unsigned char*)v)[0];
	*v=*(int*)b;
}
void swap_float(float *v)
{
	unsigned char	b[4];
	
	b[0]=((unsigned char*)v)[3];
	b[1]=((unsigned char*)v)[2];
	b[2]=((unsigned char*)v)[1];
	b[3]=((unsigned char*)v)[0];
	*v=*(float*)b;
}
void swap_rgbfloat(float *v)
{
	unsigned char	b[12];
	int	i;
	
	b[0]=((unsigned char*)v)[3];
	b[1]=((unsigned char*)v)[2];
	b[2]=((unsigned char*)v)[1];
	b[3]=((unsigned char*)v)[0];
	
	b[4]=((unsigned char*)v)[7];
	b[5]=((unsigned char*)v)[6];
	b[6]=((unsigned char*)v)[5];
	b[7]=((unsigned char*)v)[4];
	
	b[8]=((unsigned char*)v)[11];
	b[9]=((unsigned char*)v)[10];
	b[10]=((unsigned char*)v)[9];
	b[11]=((unsigned char*)v)[8];
	for(i=0;i<12;i++)
		((unsigned char*)v)[i]=b[i];
}

