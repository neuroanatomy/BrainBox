/*
 *  MGH.c
 *
 *  Created by rOBERTO tORO on 23/02/2009.
 *  Copyright 2009 __MyCompanyName__. All rights reserved.
 *
 */

#include "MGH.h"

#define kMOTOROLA	1
#define kINTEL		2

#define MGHUCHAR	0
#define	MGHINT		1
#define MGHFLOAT	3
#define MGHSHORT	4

void MGH_load_vol(char *path, char **vol, int *sz, int endianness);
static void swap_hdrMGH(MGHHeader *hdr);
static void mghHdr2analyzeHdr(MGHHeader mghHdr, AnalyzeHeader *hdr);

void MGH_load(char *path, char **vol,int *sz, int volumeType)
{
	int		endianness;
	char	b[]={1,0,0,0};
	int		num=*(int*)b;
	char	path2[512];
	char	cmd[512];
	int		i;
	
	// check endianness
	if(num==16777216)
		endianness=kMOTOROLA;
	else
		endianness=kINTEL;
	
	// point to appropriate file depending on volumeType
	switch(volumeType)
	{
		case kORIG:		sprintf(path2,"%s/mri/orig.mgz",path);	break;
		case kNU:		sprintf(path2,"%s/mri/nu.mgz",path);	break;
		case kBRAIN:	sprintf(path2,"%s/mri/brain.mgz",path);	break;
		case kASEG:		sprintf(path2,"%s/mri/aseg.mgz",path);	break;
		case kFILLED:	sprintf(path2,"%s/mri/filled.mgz",path);break;
		case kT1:		sprintf(path2,"%s/mri/T1.mgz",path);	break;
	}
	
	// uncompress orig.mgz into a temporary .mgh file
	srand (time(NULL)+getpid());
	i=rand();
	sprintf(cmd,"gunzip -c %s > /tmp/%i.mgh",path2,i);
	system(cmd);
	sprintf(path2,"/tmp/%i.mgh",i);
	
	// load temporary file
	MGH_load_vol(path2,vol,sz, endianness);
	
	// erase temporary file
	sprintf(cmd,"rm /tmp/%i.mgh",i);
	system(cmd);
}
void MGH_load_GZ(char *path, char **vol,int *sz)
{
	int		endianness;
	char	b[]={1,0,0,0};
	int		num=*(int*)b;
	char	path2[512];
	char	cmd[512];
	int		i;
	
	// check endianness
	if(num==16777216)
		endianness=kMOTOROLA;
	else
		endianness=kINTEL;
	
	// uncompress orig.mgz into a temporary .mgh file
	srand (time(NULL)+getpid());
	i=rand();
	sprintf(cmd,"gunzip -c %s > /tmp/%i.mgh",path,i);
	system(cmd);
	sprintf(path2,"/tmp/%i.mgh",i);
	
	// load temporary file
	MGH_load_vol(path2,vol,sz, endianness);
	
	// erase temporary file
	sprintf(cmd,"rm /tmp/%i.mgh",i);
	system(cmd);
}
void MGH_load_vol(char *path, char **vol, int *sz, int endianness)
{
	FILE			*f;
	MGHHeader		mghHdr;
	AnalyzeHeader	hdr;
	
	// read header
	*sz=sizeof(MGHHeader);
	f=fopen(path,"r");
	if(f==NULL)
		return;
	fread(&mghHdr,*sz,sizeof(char),f);
	
	// swap if needed (freesurfer files are big endian)
	if(endianness==kINTEL)
		swap_hdrMGH(&mghHdr);
		
	// convert to Analyze format
	mghHdr2analyzeHdr(mghHdr,&hdr);
	
	// read volume
	*sz=hdr.dim[1]*hdr.dim[2]*hdr.dim[3];
	*vol=calloc(*sz*bytesPerVoxel(hdr)+sizeof(hdr),1);
	memcpy(*vol,&hdr,sizeof(hdr));
	fread(*vol+sizeof(hdr),*sz,bytesPerVoxel(hdr),f);
	
	// swap if needed
	if(endianness==kINTEL)
		swap_img(*vol+sizeof(hdr),hdr);
	fclose(f);
	
	*sz=hdr.dim[1]*hdr.dim[2]*hdr.dim[3]*bytesPerVoxel(hdr)+sizeof(hdr);
}
static void mghHdr2analyzeHdr(MGHHeader mghHdr, AnalyzeHeader *hdr)
{
	hdr->sizeof_hdr=sizeof(*hdr);
	sprintf(hdr->data_type,"mm");
	
	hdr->dim[0]=1; // <15 => littleEndian
	hdr->dim[1]=mghHdr.ndim1;
	hdr->dim[2]=mghHdr.ndim2;
	hdr->dim[3]=mghHdr.ndim3;
	switch(mghHdr.type)
	{
		case MGHUCHAR:		hdr->datatype=UCHAR;	break;
		case MGHSHORT:		hdr->datatype=SHORT;	break;
		case MGHINT:		hdr->datatype=INT;		break;
		case MGHFLOAT:		hdr->datatype=FLOAT;	break;
	}
	hdr->pixdim[0]=1;
	hdr->pixdim[1]=1;
	hdr->pixdim[2]=1;
	hdr->pixdim[3]=1;
}
#pragma mark -

static void swap_hdrMGH(MGHHeader *hdr)
{
	
	swap_int(&(*hdr).version);
	swap_int(&(*hdr).ndim1);
	swap_int(&(*hdr).ndim2);
	swap_int(&(*hdr).ndim3);
	swap_int(&(*hdr).nframes);
	swap_int(&(*hdr).type);
	swap_int(&(*hdr).dof);
}
