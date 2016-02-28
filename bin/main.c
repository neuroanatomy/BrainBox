//char	version[]="volume, v2, roberto toro, 10 December 2010";	// added -decompose
//char	version[]="volume, v3, roberto toro, 9 August 2015";	// added support to nii and nii.gz
char	version[]="volume, v4, roberto toro, 9 August 2015";	// added surfaceNets for isosurface extraction

#include <stdio.h>
#include "Analyze.h"
#include "MGH.h"
#include "Nifti.h"
#include "math.h"
#include "limits.h"
#include <unistd.h>

#define MAX(x,y) (((x)>(y))?(x):(y))
#define pi 3.1415926535897932384626433832795028841971

#define kAnalyzeVolume	1
#define kMGZVolume		2
#define kNiftiVolume	3
#define kNiftiGZVolume	4
#define kNiftiZipVolume	5

typedef struct {
    float x,y,z;
} float3D;
typedef struct {
    int a,b,c;
} int3D;
typedef struct {
    int np,nt;
    float3D *p;
    int3D *t;
} Mesh;

AnalyzeHeader	*hdr;
char			*img;
int				dim[4];
float           voxdim[4];
int				verbose=1;

void threshold(float value, int direction);

float getValue(int x, int y, int z)
{
	float		val;
	RGBValue	rgb;

	if(hdr->datatype==RGB)
	{
		rgb=((RGBValue*)img)[z*dim[1]*dim[0]+y*dim[0]+x];
		val=((int)rgb.r)>>16|((int)rgb.g)>>8|((int)rgb.b);
	}
	else
	{
		switch(hdr->datatype)
		{	case UCHAR: val=((unsigned char*)img)[z*dim[1]*dim[0]+y*dim[0]+x];	break;
			case SHORT: val=        ((short*)img)[z*dim[1]*dim[0]+y*dim[0]+x];	break;
			case INT:	val=          ((int*)img)[z*dim[1]*dim[0]+y*dim[0]+x];	break;
			case FLOAT:	val=        ((float*)img)[z*dim[1]*dim[0]+y*dim[0]+x];	break;
		}
	}
	return val;
}
float getValue1(int index)
{
    float		val;
    RGBValue	rgb;
    
    if(hdr->datatype==RGB)
    {
        rgb=((RGBValue*)img)[index];
        val=((int)rgb.r)>>16|((int)rgb.g)>>8|((int)rgb.b);
    }
    else
    {
        switch(hdr->datatype)
        {	case UCHAR: val=((unsigned char*)img)[index];	break;
            case SHORT: val=        ((short*)img)[index];	break;
            case INT:	val=          ((int*)img)[index];	break;
            case FLOAT:	val=        ((float*)img)[index];	break;
        }
    }
    return val;
}

void setValue(float val, int x, int y, int z)
{
	switch(hdr->datatype)
	{	case UCHAR: ((unsigned char*)img)[z*dim[1]*dim[0]+y*dim[0]+x]=val;			break;
		case SHORT: ((short*)img)[z*dim[1]*dim[0]+y*dim[0]+x]=val;					break;
		case INT:	((int*)img)[z*dim[1]*dim[0]+y*dim[0]+x]=val;					break;
		case FLOAT:	((float*)img)[z*dim[1]*dim[0]+y*dim[0]+x]=val;					break;
	}
}
float getValue2(int i, AnalyzeHeader *theHdr, char *theImg)
{
	float		val;
	RGBValue	rgb;
	
	if(theHdr->datatype==RGB)
	{
		rgb=((RGBValue*)theImg)[i];
		val=((int)rgb.r)>>16|((int)rgb.g)>>8|((int)rgb.b);
	}
	else
	{
		switch(theHdr->datatype)
		{	case UCHAR: val=((unsigned char*)theImg)[i];	break;
			case SHORT: val=        ((short*)theImg)[i];	break;
			case INT:	val=          ((int*)theImg)[i];	break;
			case FLOAT:	val=        ((float*)theImg)[i];	break;
		}
	}
	return val;
}

void setValue2(float val, int i, AnalyzeHeader *theHdr, char *theImg)
{
	switch(theHdr->datatype)
	{	case UCHAR: ((unsigned char*)theImg)[i]=val;	break;
		case SHORT: ((short*)theImg)[i]=val;			break;
		case INT:	((int*)theImg)[i]=val;				break;
		case FLOAT:	((float*)theImg)[i]=val;			break;
	}
}
#pragma mark -
#pragma mark [ Utilities ]
int     endianness;
#define kMOTOROLA   1
#define kINTEL      2
void checkEndianness(void)
{
    char    b[]={1,0,0,0};
    int     num=*(int*)b;
    
    if(num==16777216)
        endianness=kMOTOROLA;
    else
        endianness=kINTEL;
}
#pragma mark -
#define STACK 600000
int connected(int x, int y, int z, int label)
{
	int		n,i,j,k;
	int		dx,dy,dz;
	int		dire[6]={0,0,0,0,0,0};
	int		nstack=0;
	short	stack[STACK][3];
	char	dstack[STACK];
	int		empty,mark;
	char	*tmp;

	tmp=(char*)calloc(dim[0]*dim[1]*dim[2],sizeof(char));

	n=0;
	for(;;)
	{
		tmp[z*dim[1]*dim[0]+y*dim[0]+x]=1;
		n++;
		
		for(k=0;k<6;k++)
		{
			dx = (-1)*(	k==3 ) + ( 1)*( k==1 );
			dy = (-1)*( k==2 ) + ( 1)*( k==0 );
			dz = (-1)*( k==5 ) + ( 1)*( k==4 );

			if(	z+dz>=0 && z+dz<dim[2] &&
				y+dy>=0 && y+dy<dim[1] &&
				x+dx>=0 && x+dx<dim[0] )
			{
				empty=(getValue(x+dx,y+dy,z+dz)==1);
				mark = tmp[(z+dz)*dim[1]*dim[0]+(y+dy)*dim[0]+(x+dx)];
				if( empty && !mark && !dire[k])
				{
					dire[k] = 1;
					dstack[nstack] = k+1;
					stack[nstack][0]=x+dx;
					stack[nstack][1]=y+dy;
					stack[nstack][2]=z+dz;
					nstack++;
				}
				else
					if( dire[k] && !empty && !mark)
						dire[k] = 0;
			}
		}
		if(nstack>STACK-10)
		{
			printf("StackOverflow\n");
			break;
		}
		if(nstack)
		{
			nstack--;
			x = stack[nstack][0];
			y = stack[nstack][1];
			z = stack[nstack][2];
			for(k=0;k<6;k++)
				dire[k] = (dstack[nstack]==(k+1))?0:dire[k];
		}
		else
			break;
	}
	
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	if(tmp[k*dim[1]*dim[0]+j*dim[0]+i]==1)
		setValue(label,i,j,k);
	free(tmp);
	
	return n;
}
void largestConnected(void)
{
	int	label;
	int	i,j,k,n;
	int	max,labelmax;
	
	threshold(1,1); // if vox>=1 then vox=1, else vox=0
	
	max=0;
	label=2;
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	if(getValue(i,j,k)==1)
	{
		n=connected(i,j,k,label);
		if(n>max)
		{
			max=n;
			labelmax=label;
		}
		label++;
	}

	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	if(getValue(i,j,k)==labelmax)
		setValue(1,i,j,k);
	else
		setValue(0,i,j,k);
}
void dilate(int r)
{
	int		i,j,k;
	int		a,b,c;
	char	*tmp=calloc(dim[0]*dim[1]*dim[2],1);
	
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
		tmp[k*dim[1]*dim[0]+j*dim[0]+i]=(getValue(i,j,k)>0);
	
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	if(getValue(i,j,k))
	{
		for(a=-r;a<=r;a++)
		for(b=-r;b<=r;b++)
		for(c=-r;c<=r;c++)
		if(	i+a>=0 && i+a<dim[0] &&
			j+b>=0 && j+b<dim[1] &&
			k+c>=0 && k+c<dim[2])
		if(a*a+b*b+c*c<=r*r)
		if(getValue(i+a,j+b,k+c)<1)
			tmp[(k+c)*dim[1]*dim[0]+(j+b)*dim[0]+(i+a)]=1;
	}

	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	if(getValue(i,j,k)<1 && tmp[k*dim[1]*dim[0]+j*dim[0]+i]>0)
		setValue(1,i,j,k);
	free(tmp);
}
void erode(int r)
{
    printf("[erode]\n");
	int		i,j,k;
	int		a,b,c;
	char	*tmp=calloc(dim[0]*dim[1]*dim[2],1);
	
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
		tmp[k*dim[1]*dim[0]+j*dim[0]+i]=(getValue(i,j,k)>0);
	
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	if(getValue(i,j,k)<1)
	{
		for(a=-r;a<=r;a++)
		for(b=-r;b<=r;b++)
		for(c=-r;c<=r;c++)
		if(	i+a>=0 && i+a<dim[0] &&
			j+b>=0 && j+b<dim[1] &&
			k+c>=0 && k+c<dim[2])
		if(a*a+b*b+c*c<=r*r)
		if(getValue(i+a,j+b,k+c)>0)
			tmp[(k+c)*dim[1]*dim[0]+(j+b)*dim[0]+(i+a)]=0;
	}

	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	if(getValue(i,j,k)>0 && tmp[k*dim[1]*dim[0]+j*dim[0]+i]==0)
		setValue(0,i,j,k);
	free(tmp);
}
float max(void)
{
	int		i,j,k;
	float	val,max;
	
	max=getValue(0,0,0);
	for(i=0;i<dim[0];i++)
		for(j=0;j<dim[1];j++)
			for(k=0;k<dim[2];k++)
			{
				val=getValue(i,j,k);
				if(val>max)
					max=val;
			}
	return max;
}
float min(void)
{
	int		i,j,k;
	float	val,min;
	
	min=getValue(0,0,0);
	for(i=0;i<dim[0];i++)
		for(j=0;j<dim[1];j++)
			for(k=0;k<dim[2];k++)
			{
				val=getValue(i,j,k);
				if(val<min)
					min=val;
			}
	return min;
}

void compress_dct_1d(float *in, float *out, int N)
{
	int n,k;

	for(k=0;k<N;k++)
	{
		float z=0;
		for(n=0;n<N;n++)
			z+=in[n]*cos(pi*(2*n+1)*k/(float)(2*N));
		out[k]=z*((k==0)?1/sqrt(N):sqrt(2/(float)N));
	}
}
void compress_idct_1d(float *in, float *out, int N)
{
	int n,k;

	for(n=0;n<N;n++)
	{
		float z=0;
		for(k=0;k<N;k++)
			z+=((k==0)?1/sqrt(N):sqrt(2/(float)N))*in[k]*cos(pi*(2*n+1)*k/(float)(2*N));
		out[n]=z;
	}
}
void compress_dct(float *vol,float *coeff,int *d)
{
	int i,j,k;
	float *in,*out;
    int max;
    
    max=(d[0]>d[1])?d[0]:d[1];
    max=(d[2]>max)?d[2]:max;
    in=(float*)calloc(max,sizeof(float));
    out=(float*)calloc(max,sizeof(float));
	
    for(i=0;i<d[0];i++)
	for(j=0;j<d[1];j++)
	{
		for(k=0;k<d[2];k++)
			in[k]=vol[k*d[1]*d[0]+j*d[0]+i];
		compress_dct_1d(in,out,d[2]);
		for(k=0;k<d[2];k++)
			coeff[k*d[1]*d[0]+j*d[0]+i]=out[k];
	}

	for(j=0;j<d[1];j++)
	for(k=0;k<d[2];k++)
	{
		for(i=0;i<d[0];i++)
			in[i]=coeff[k*d[1]*d[0]+j*d[0]+i];
		compress_dct_1d(in,out,d[0]);
		for(i=0;i<d[0];i++)
			coeff[k*d[1]*d[0]+j*d[0]+i]=out[i];
	}

	for(k=0;k<d[2];k++)
	for(i=0;i<d[0];i++)
	{
		for(j=0;j<d[1];j++)
			in[j]=coeff[k*d[1]*d[0]+j*d[0]+i];
		compress_dct_1d(in, out,d[1]);
		for(j=0;j<d[1];j++)
			coeff[k*d[1]*d[0]+j*d[0]+i]=out[j];
	}
    
    free(in);
    free(out);
}
void compress_idct(float *vol,float *coeff,int *d)
{
	int i,j,k;
	float *in,*out;
    int max;
    
    max=(d[0]>d[1])?d[0]:d[1];
    max=(d[2]>max)?d[2]:max;
    in=(float*)calloc(max,sizeof(float));
    out=(float*)calloc(max,sizeof(float));
	
	for(i=0;i<d[0];i++)
	for(j=0;j<d[1];j++)
	{
		for(k=0;k<d[2];k++)
			in[k]=vol[k*d[1]*d[0]+j*d[0]+i];
		compress_idct_1d(in, out,d[2]);
		for(k=0;k<d[2];k++)
			coeff[k*d[1]*d[0]+j*d[0]+i]=out[k];
	}

	for(j=0;j<d[1];j++)
	for(k=0;k<d[2];k++)
	{
		for(i=0;i<d[0];i++)
			in[i]=coeff[k*d[1]*d[0]+j*d[0]+i];
		compress_idct_1d(in, out,d[0]);
		for(i=0;i<d[0];i++)
			coeff[k*d[1]*d[0]+j*d[0]+i]=out[i];
	}

	for(k=0;k<d[2];k++)
	for(i=0;i<d[0];i++)
	{
		for(j=0;j<d[1];j++)
			in[j]=coeff[k*d[1]*d[0]+j*d[0]+i];
		compress_idct_1d(in, out,d[1]);
		for(j=0;j<d[1];j++)
			coeff[k*d[1]*d[0]+j*d[0]+i]=out[j];
	}

    free(in);
    free(out);
}
void compress(float rate, char *coefffile)
{
	// based on code by Emil Mikulic at http://unix4lyfe.org/dct
	float	*tmp,*coeff;
	int		i,j,k,n=0;
	
    /*
    float   x[]={1,2,1,0,1,2,3,1},y[8];
    coeff=(float*)calloc(8,sizeof(float));
    compress_dct_1d(x,coeff,8);
    compress_idct_1d(coeff,y,8);
    */
    
    // change dimensions to multiple of 8
	tmp=(float*)calloc(dim[0]*dim[1]*dim[2],sizeof(float));
	coeff=(float*)calloc(dim[0]*dim[1]*dim[2],sizeof(float));
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
		tmp[k*dim[1]*dim[0]+j*dim[0]+i]=getValue(i,j,k);
	
	// dct
	compress_dct(tmp,coeff,dim);
	
	// compress at rate
    for(i=0;i<dim[0];i++)
    for(j=0;j<dim[1];j++)
    for(k=0;k<dim[2];k++)
    {
        if(i*i+j*j+k*k>20*20)
            coeff[k*dim[1]*dim[0]+j*dim[0]+i]=0;
        else
            n++;
    }
    printf("%i non-zero coefficients\n",n);
    
	// idct
	compress_idct(coeff,tmp,dim);
	
	// save coefficients at coeff
	
	// change volume to compressed version
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
		setValue(tmp[k*dim[1]*dim[0]+j*dim[0]+i],i,j,k);
	
	free(tmp);
    free(coeff);
}
int convert(char *dtype)
{
    float           min,max,val;
    int             i,j,k,sz;
    char            *addr0,*img0;
    
    // find min max
    min=max=getValue(0,0,0);
    for(i=0;i<dim[0];i++)
    for(j=0;j<dim[1];j++)
    for(k=0;k<dim[2];k++)
    {
        val=getValue(i,j,k);
        min=(val<min)?val:min;
        max=(val>max)?val:max;
    }

    if(strcmp(dtype,"uchar")==0)
    {
        if(min<0 || max>UCHAR_MAX)
            printf("WARNING: The original values are beyond the limits of UCHAR encoding. Values will be remaped.\n");

        sz=sizeof(char);
        img0=calloc(dim[0]*dim[1]*dim[2],sz);
        for(i=0;i<dim[0];i++)
        for(j=0;j<dim[1];j++)
        for(k=0;k<dim[2];k++)
        {
            val=getValue(i,j,k);
            if(min<0 || max>UCHAR_MAX)
                val=UCHAR_MAX*(val-min)/(max-min);
            ((unsigned char*)img0)[k*dim[1]*dim[0]+j*dim[0]+i]=(unsigned char)val;
        }
        hdr->datatype=UCHAR;
    }
    else
    if(strcmp(dtype,"short")==0)
    {
        if(min<SHRT_MIN || max>SHRT_MAX)
            printf("WARNING: The original values are beyond the limits of SHORT encoding. Values will be remaped.\n");

        sz=sizeof(short);
        img0=calloc(dim[0]*dim[1]*dim[2],sz);
        for(i=0;i<dim[0];i++)
        for(j=0;j<dim[1];j++)
        for(k=0;k<dim[2];k++)
        {
            val=getValue(i,j,k);
            if(min<SHRT_MIN || max>SHRT_MAX)
            {
                val=(val-min)/(max-min);
                val=SHRT_MIN*(1-val)+SHRT_MAX*val;
            }
            
            ((short*)img0)[k*dim[1]*dim[0]+j*dim[0]+i]=(short)val;
        }
        hdr->datatype=SHORT;
    }
    else
    if(strcmp(dtype,"int")==0)
    {
        if(min<INT_MIN || max>INT_MAX)
            printf("WARNING: The original values are beyond the limits of INT encoding. Values will be remaped.\n");

        sz=sizeof(int);
        img0=calloc(dim[0]*dim[1]*dim[2],sz);
        for(i=0;i<dim[0];i++)
        for(j=0;j<dim[1];j++)
        for(k=0;k<dim[2];k++)
        {
            val=getValue(i,j,k);
            if(min<INT_MIN || max>INT_MAX)
            {
                val=(val-min)/(max-min);
                val=INT_MIN*(1-val)+INT_MAX*val;
            }
            ((int*)img0)[k*dim[1]*dim[0]+j*dim[0]+i]=(int)val;
        }
        hdr->datatype=INT;
    }
    else
    if(strcmp(dtype,"float")==0)
    {
        sz=sizeof(float);
        img0=calloc(dim[0]*dim[1]*dim[2],sz);
        for(i=0;i<dim[0];i++)
        for(j=0;j<dim[1];j++)
        for(k=0;k<dim[2];k++)
        {
            val=getValue(i,j,k);
            ((float*)img0)[k*dim[1]*dim[0]+j*dim[0]+i]=(float)val;
        }
        hdr->datatype=FLOAT;
    }
    else
    {
        printf("ERROR: Unknown format %s. Select among uchar, short, int or float\n",dtype);
        return 1;
    }
    
    addr0=calloc(dim[0]*dim[1]*dim[2]*sz+sizeof(AnalyzeHeader),sizeof(char));
    memcpy(addr0,(char*)hdr,sizeof(AnalyzeHeader));
    memcpy(addr0+sizeof(AnalyzeHeader),img0,dim[0]*dim[1]*dim[2]*sz);
    
    free((char*)hdr);
    free(img0);
    hdr=(AnalyzeHeader*)addr0;
    img=(char*)((char*)hdr+sizeof(AnalyzeHeader));
    
    return 0;
}
void hist(int nbins)
{
	int		i,j,k;
	float	mi,ma;
	float	*hist;
	
	hist=(float*)calloc(nbins,sizeof(float));
	
	mi=min();
	ma=max();
	
	for(i=0;i<dim[0];i++)
		for(j=0;j<dim[1];j++)
			for(k=0;k<dim[2];k++)
				hist[(int)((nbins-1)*(getValue(i,j,k)-mi)/(ma-mi))]++;
	
	for(i=0;i<nbins;i++)
	{
		printf("%g",hist[i]);
		if(i<nbins-1)
			printf(" ");
	}
	printf("\n");
	free(hist);
}
float mean(void)
{
	int		i,j,k;
	float	sum=0;

	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
		sum+=getValue(i,j,k);
	return sum/(float)(dim[0]*dim[1]*dim[2]);
}
float std(void)
{
	int		i,j,k;
	float	val;
	float	s0=dim[0]*dim[1]*dim[2];
	float	s1=0;
	float	s2=0;

	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	{
		val=getValue(i,j,k);
		s1+=val;
		s2+=val*val;
	}
	return sqrt((s0*s2-s1*s1)/(s0*(s0-1)));
}
void threshold(float value, int direction)
{
	int		i,j,k;
	float	val;

	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	{
		val=getValue(i,j,k);
		if((val>=value && direction==1)||(val<=value && direction==0))
			setValue(1,i,j,k);
	}
}
void tiff(char *path, float *m, int W, int H, char *cmapindex)
{
	FILE	*f;
	int		i,n,S;
	unsigned char	hdr[]={	0x4d,0x4d,
		0x00,0x2a,
		0x00,0x00,0x00,0x08,
		0x00,0x0d,														// declare 13 fields
		0x01,0xfe, 0x00,0x04, 0x00,0x00,0x00,0x01, 0x00,0x00,0x00,0x00,
		0x01,0x00, 0x00,0x03, 0x00,0x00,0x00,0x01, 0x00,0x40,0x00,0x00,	// image width
		0x01,0x01, 0x00,0x03, 0x00,0x00,0x00,0x01, 0x00,0x20,0x00,0x00,	// image length
		0x01,0x02, 0x00,0x03, 0x00,0x00,0x00,0x03, 0x00,0x00,0x00,0xaa,	// bits per sample [addr: aa]
		0x01,0x03, 0x00,0x03, 0x00,0x00,0x00,0x01, 0x00,0x01,0x00,0x00,	// compression
		0x01,0x06, 0x00,0x03, 0x00,0x00,0x00,0x01, 0x00,0x02,0x00,0x00,	// photometric interpretation
		0x01,0x11, 0x00,0x04, 0x00,0x00,0x00,0x01, 0x00,0x00,0x00,0xc0,	// strip offsets [addr:0xc0]
		0x01,0x15, 0x00,0x03, 0x00,0x00,0x00,0x01, 0x00,0x03,0x00,0x00,	// samples per pixel
		0x01,0x16, 0x00,0x03, 0x00,0x00,0x00,0x01, 0x00,0x20,0x00,0x00,	// rows per strip
		0x01,0x17, 0x00,0x04, 0x00,0x00,0x00,0x01, 0x00,0x00,0x18,0x00,	// strip byte counts
		0x01,0x1a, 0x00,0x05, 0x00,0x00,0x00,0x01, 0x00,0x00,0x00,0xb0,	// x resolution [addr: b0]
		0x01,0x1b, 0x00,0x05, 0x00,0x00,0x00,0x01, 0x00,0x00,0x00,0xb8,	// y resolution [addr: b8]
		0x01,0x28, 0x00,0x03, 0x00,0x00,0x00,0x01, 0x00,0x02,0x00,0x00,	// resolution unit
		0x00,0x00,0x00,0x00,
		0x00,0x08, 0x00,0x08, 0x00,0x08,								// [addr 0xAA] bits per sample: 8,8,8
		0x00,0x0a,0xfc,0x80, 0x00,0x00,0x27,0x10,						// [addr 0xB0] x resolution 72
		0x00,0x0a,0xfc,0x80, 0x00,0x00,0x27,0x10,						// [addr 0xB8] y resolution 72
	};
	// image width
	hdr[31]=((unsigned char *)&W)[0];
	hdr[30]=((unsigned char *)&W)[1];
	hdr[33]=((unsigned char *)&W)[2];
	hdr[32]=((unsigned char *)&W)[3];
	
	// image length
	hdr[43]=((unsigned char *)&H)[0];
	hdr[42]=((unsigned char *)&H)[1];
	hdr[45]=((unsigned char *)&H)[2];
	hdr[44]=((unsigned char *)&H)[3];
	
	// rows per strip = image length
	hdr[115]=((unsigned char *)&H)[0];
	hdr[114]=((unsigned char *)&H)[1];
	hdr[117]=((unsigned char *)&H)[2];
	hdr[116]=((unsigned char *)&H)[3];
	
	// strip byte counts = image length * image width * 3
	S=W*H*3;
	hdr[129]=((unsigned char *)&S)[0];
	hdr[128]=((unsigned char *)&S)[1];
	hdr[127]=((unsigned char *)&S)[2];
	hdr[126]=((unsigned char *)&S)[3];
	
	
	// make a colour map
	unsigned char cmap[256][3];
	cmap[0][0]=cmap[0][1]=cmap[0][2]=0;
	srand(0);
	for(i=1;i<256;i++)
	{
		cmap[i][0]=rand()%256;
		cmap[i][1]=rand()%256;
		cmap[i][2]=rand()%256;
	}
	
	f=fopen(path,"w");
	n=sizeof(hdr);
	for(i=0;i<n;i++)
		fputc(hdr[i],f);
	for(i=0;i<W*H;i++)
	{
		if(strcmp(cmapindex,"grey")==0)
		{
			fputc((int)(m[i]),f);
			fputc((int)(m[i]),f);
			fputc((int)(m[i]),f);
		}
		else
		if(strcmp(cmapindex,"lut")==0)
		{
			fputc(cmap[(int)(m[i])][0],f);
			fputc(cmap[(int)(m[i])][1],f);
			fputc(cmap[(int)(m[i])][2],f);
		}

	}
	fclose(f);
	
}
void drawSlice(char *path, char *cmap, char *ori)
{
    float	*m;
    int     x,y,z;
    float   val,min,max;
    
    switch(ori[0])
    {
        case 'x':
            x=dim[0]/2;
            m=(float*)calloc(dim[1]*dim[2],sizeof(float));
            min=max=getValue(x,0,0);
            for(y=0;y<dim[1];y++)
            for(z=0;z<dim[2];z++)
            {
                val=getValue(x,y,z);
                min=(val<min)?val:min;
                max=(val>max)?val:max;
            }
            for(y=0;y<dim[1];y++)
                for(z=0;z<dim[2];z++)
                    m[z*dim[1]+y]=255*(getValue(x,y,z)-min)/(max-min);
            tiff(path,m,dim[1],dim[2],cmap);
            break;
        case 'y':
            y=dim[1]/2;
            m=(float*)calloc(dim[0]*dim[2],sizeof(float));
            min=max=getValue(0,y,0);
            for(x=0;x<dim[0];x++)
            for(z=0;z<dim[2];z++)
            {
                val=getValue(x,y,z);
                min=(val<min)?val:min;
                max=(val>max)?val:max;
            }
            for(x=0;x<dim[0];x++)
                for(z=0;z<dim[2];z++)
                    m[z*dim[0]+x]=255*(getValue(x,y,z)-min)/(max-min);
            tiff(path,m,dim[0],dim[2],cmap);
            break;
        case 'z':
            z=dim[2]/2;
            m=(float*)calloc(dim[0]*dim[1],sizeof(float));
            min=max=getValue(0,0,z);
            for(x=0;x<dim[0];x++)
            for(y=0;y<dim[1];y++)
            {
                val=getValue(x,y,z);
                min=(val<min)?val:min;
                max=(val>max)?val:max;
            }
            for(x=0;x<dim[0];x++)
                for(y=0;y<dim[1];y++)
                    m[y*dim[0]+x]=255*(getValue(x,y,z)-min)/(max-min);
            tiff(path,m,dim[0],dim[1],cmap);
            break;
    }
    free(m);
}
float volume(void)
{
	int		i,j,k;
	int		nv;
	float	vvol,vol;
	
	vvol=hdr->pixdim[1]*hdr->pixdim[2]*hdr->pixdim[3];
	nv=0;
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	if(getValue(i,j,k))
		nv++;
	
	vol=fabs(nv*vvol);
	
	return vol;
}
void decompose(char *basename)
{
	int				i,j,k;
	int				x,y,z;
	float			val;
	AnalyzeHeader	*hdr;
	char			*addr,*img;
	char			path[1024];
	char			sizeof_hdr[4]={92,1,0,0};
	
	// create empty UCHAR volume
	addr=calloc(dim[0]*dim[1]*dim[2]+sizeof(AnalyzeHeader),sizeof(char));
	hdr=(AnalyzeHeader*)addr;
	img=addr+sizeof(AnalyzeHeader);
	hdr->sizeof_hdr=*(int*)sizeof_hdr;
	hdr->datatype=UCHAR;
	hdr->dim[0]=3;
	hdr->dim[1]=dim[0];
	hdr->dim[2]=dim[1];
	hdr->dim[3]=dim[2];
	hdr->pixdim[1]=4;
	hdr->pixdim[2]=4;
	hdr->pixdim[3]=4;
	
	// decompose volume
	for(i=0;i<dim[0];i++)
	for(j=0;j<dim[1];j++)
	for(k=0;k<dim[2];k++)
	{
		val=getValue(i,j,k);
		if(val!=0)
		{
			for(x=0;x<dim[0];x++)
			for(y=0;y<dim[1];y++)
			for(z=0;z<dim[2];z++)
			if(getValue(x,y,z)==val)
			{
				img[z*dim[1]*dim[0]+y*dim[0]+x]=1;
				setValue(0,x,y,z);
			}
			else
				img[z*dim[1]*dim[0]+y*dim[0]+x]=0;

			sprintf(path,"%s_%g.hdr",basename,val);
			Analyze_save_hdr(path,*hdr);
			sprintf(path,"%s_%g.img",basename,val);
			Analyze_save_img(path,*hdr,img);
		}
	}
}
void matchHistogram(char *volpath)
{
	int				i,j,n,n0;
	int				sz;
	int				swapped;
	char			*addr;
	AnalyzeHeader	*hdr0;
	char			*img0;
	int				*hist,*hist0;
	float			*cumsum0,cumsum,prev;
	float			val;
	float			min,min0;
	float			max,max0;
	float			d,t,*trans;
	
	// load target volume
	Analyze_load(volpath,&addr,&sz,&swapped);
	hdr0=(AnalyzeHeader*)addr;
	img0=(char*)(addr+sizeof(AnalyzeHeader));
	// find max grey value in target volume
	n0=hdr0->dim[1]*hdr0->dim[2]*hdr0->dim[3];
	min0=max0=getValue2(0,hdr0,img0);
	for(i=0;i<n0;i++)
	{
		val=getValue2(i,hdr0,img0);
		if(val>max0)
			max0=val;
		if(val<min0)
			min0=val;
	}
	// compute histogram for target volume
	hist0=(int*)calloc(max0-min0+1,sizeof(int));
	for(i=0;i<n0;i++)
		hist0[(int)(getValue2(i,hdr0,img0)-min0)]++;
	// compute cummulative histogram for target colume
	cumsum0=(float*)calloc(max0-min0+1,sizeof(float));
	cumsum0[0]=hist0[0];///(float)n0;
	for(i=1;i<max0-min0+1;i++)
		cumsum0[i]=cumsum0[i-1]+hist0[i];
	for(i=0;i<max0-min0+1;i++)
		cumsum0[i]/=(float)n0;
	
	// find max grey value in source volume
	n=hdr->dim[1]*hdr->dim[2]*hdr->dim[3];
	min=max=getValue2(0,hdr,img);
	for(i=0;i<n;i++)
	{
		val=getValue2(i,hdr,img);
		if(val>max)
			max=val;
		if(val<min)
			min=val;
	}
	// compute histogram for source volume
	hist=(int*)calloc(max-min+1,sizeof(int));
	for(i=0;i<n;i++)
		hist[(int)(getValue2(i,hdr,img)-min)]++;
	
	// compute histogram matching transformation
	trans=(float*)calloc(max,sizeof(float));
	cumsum=0;
	prev=0;
	j=0;
	for(i=0;i<max-min+1;i++)
	{
		cumsum+=hist[i];
		
		// find grey level in target volume where cumsum0==cumsum
		while(cumsum0[j]<cumsum/(float)n)
		{
			prev=cumsum0[j];
			j++;
		}
		d=cumsum0[j]-prev;
		if(d)
			t=(cumsum/(float)n-prev)/d;
		else
			t=0;
		
		val=MAX(j-1,0)*(1-t)+j*t+min0;
		
		if(val>max0)
			printf("ça va pas, non?\n");
		
		trans[i+(int)min]=val;
		
	}
	
	// apply histogram matching transformation
	for(i=0;i<n;i++)
		setValue2(trans[(int)getValue2(i,hdr,img)],i,hdr,img);
}
void zigzag(void)
{
    int m,n=0;
    int d[]={0,0,0};
    int s;

    m=(dim[0]>dim[1])?dim[0]:dim[1];
    m=(dim[2]>m)?dim[2]:m;

    for(s=0;s<=m*3;s++)
    {
        for(d[0]=s;d[0]>=0;d[0]--)
            if(d[0]%2==0)
                for(d[1]=0;d[1]<=s-d[0];d[1]++)
                {
                    d[2]=s-d[0]-d[1];
                    if(d[(0-s+m*3)%3]<dim[0]&&
                       d[(1-s+m*3)%3]<dim[1]&&
                       d[(2-s+m*3)%3]<dim[2])
                    {
                        printf("%f ",getValue(d[(0-s+m*3)%3],d[(1-s+m*3)%3],d[(2-s+m*3)%3]));
                        if(n>5000)
                            setValue(0,d[(0-s+m*3)%3],d[(1-s+m*3)%3],d[(2-s+m*3)%3]);
                        n++;
                    }
                }
            else
                for(d[1]=s-d[0];d[1]>=0;d[1]--)
                {
                    d[2]=s-d[0]-d[1];
                    if(d[(0-s+m*3)%3]<dim[0]&&
                       d[(1-s+m*3)%3]<dim[1]&&
                       d[(2-s+m*3)%3]<dim[2])
                    {
                        printf("%f ",getValue(d[(0-s+m*3)%3],d[(1-s+m*3)%3],d[(2-s+m*3)%3]));
                        if(n>5000)
                            setValue(0,d[(0-s+m*3)%3],d[(1-s+m*3)%3],d[(2-s+m*3)%3]);
                        n++;
                    }
                }
    }
    printf("\n");
}
void strokeMesh(char *path)
{
    FILE    *f;
    char    str[1024];
    int     np,i;
    float   mx,x,y,z;
    
    mx=max();
    
    f=fopen(path,"r");
    fgets(str,1024,f);
    sscanf(str," %i %*i ",&np);
    for(i=0;i<np;i++)
    {
        fgets(str,1024,f);
        sscanf(str," %f %f %f ",&x,&y,&z);
        x/=hdr->pixdim[1];
        y/=hdr->pixdim[2];
        z/=hdr->pixdim[3];
        if(x<0||x>=dim[0]||y<0||y>=dim[1]||z<0||z>=dim[2])
        {
            printf("ERROR: mesh out of volume bounds\n");
            break;
        }
        setValue(mx+1,(int)(x+0.5),(int)(y+0.5),(int)(z+0.5));
    }
}

int cube_edges[24];
int edge_table[256];
int buffer[4096];
void surfaceNets_init(void)
{
    int i,j,p,em,k = 0;
    for(i=0; i<8; ++i) {
        for(j=1; j<=4; j=j<<1) {
            p = i^j;
            if(i <= p) {
                cube_edges[k++] = i;
                cube_edges[k++] = p;
            }
        }
    }
    for(i=0; i<256; ++i) {
        em = 0;
        for(j=0; j<24; j+=2) {
            int a = !(i & (1<<cube_edges[j]));	// was !!, which in js turns into boolean false null, undefined, etc
            int b = !(i & (1<<cube_edges[j+1]));
            em |= a != b ? (1 << (j >> 1)) : 0; // was !==
        }
        edge_table[i] = em;
    }
}
void surfaceNets(float level, Mesh *mesh, int storeFlag)
{
    float3D *vertices=mesh->p;
    int3D *faces=mesh->t;
    int n = 0;
    float x[3];
    int R[3];
    float *grid = (float*)calloc(8,sizeof(float));
    int buf_no = 1;
    int *buffer;
    int buffer_length=0;
    int vertices_length=0;
    int faces_length=0;
    int	i,j,k;
    
    R[0]=1;
    R[1]=dim[0]+1;
    R[2]=(dim[0]+1)*(dim[1]+1);
    
    if(R[2] * 2 > buffer_length)
        buffer = (int*)calloc(R[2] * 2,sizeof(int));
    
    for(x[2]=0; x[2]<dim[2]-1; ++x[2])
    {
        n+=dim[0];
        buf_no ^= 1;
        R[2]=-R[2];
        
        int m = 1 + (dim[0]+1) * (1 + buf_no * (dim[1]+1));
        for(x[1]=0; x[1]<dim[1]-1; ++x[1], ++n, m+=2)
            for(x[0]=0; x[0]<dim[0]-1; ++x[0], ++n, ++m)
            {
                int mask = 0, g = 0, idx = n;
                for(k=0; k<2; ++k, idx += dim[0]*(dim[1]-2))
                    for(j=0; j<2; ++j, idx += dim[0]-2)
                        for(i=0; i<2; ++i, ++g, ++idx)
                        {
                            float p = getValue1(idx)-level;
                            grid[g] = p;
                            mask |= (p < 0) ? (1<<g) : 0;
                        }
                if(mask == 0 || mask == 0xff)
                    continue;
                int edge_mask = edge_table[mask];
                float3D v = {0.0,0.0,0.0};
                int e_count = 0;
                for(i=0; i<12; ++i)
                {
                    if(!(edge_mask & (1<<i)))
                        continue;
                    ++e_count;
                    int e0 = cube_edges[ i<<1 ];       //Unpack vertices
                    int e1 = cube_edges[(i<<1)+1];
                    float g0 = grid[e0];                 //Unpack grid values
                    float g1 = grid[e1];
                    float t  = g0 - g1;                  //Compute point of intersection
                    if(fabs(t) > 1e-6)
                        t = g0 / t;
                    else
                        continue;
                    k=1;
                    for(j=0; j<3; ++j)
                    {
                        k=k<<1;
                        int a = e0 & k;
                        int b = e1 & k;
                        if(a != b)
                            ((float*)&v)[j] += a ? 1.0 - t : t;
                        else
                            ((float*)&v)[j] += a ? 1.0 : 0;
                    }
                }
                float s = 1.0 / e_count;
                for(i=0; i<3; ++i)
                    ((float*)&v)[i] = x[i] + s * ((float*)&v)[i];
                buffer[m] = vertices_length;
                if(storeFlag)
                    vertices[vertices_length++]=v;
                else
                    vertices_length++;
                for(i=0; i<3; ++i)
                {
                    if(!(edge_mask & (1<<i)) )
                        continue;
                    int iu = (i+1)%3;
                    int iv = (i+2)%3;
                    if(x[iu] == 0 || x[iv] == 0)
                        continue;
                    int du = R[iu];
                    int dv = R[iv];
                    
                    if(storeFlag)
                    {
                        if(mask & 1)
                        {
                            faces[faces_length++]=(int3D){buffer[m], buffer[m-du-dv], buffer[m-du]};
                            faces[faces_length++]=(int3D){buffer[m], buffer[m-dv], buffer[m-du-dv]};
                        }
                        else
                        {
                            faces[faces_length++]=(int3D){buffer[m], buffer[m-du-dv], buffer[m-dv]};
                            faces[faces_length++]=(int3D){buffer[m], buffer[m-du], buffer[m-du-dv]};
                        }
                    }
                    else
                        faces_length+=2;
                }
            }
    }
    mesh->np=vertices_length;
    mesh->nt=faces_length;
}

void sampleMesh(char *mesh,char *result)
{
    FILE    *f1,*f2;
    char    str[1024];
    int     np,i;
    float   x,y,z,val;
    
    f1=fopen(mesh,"r");
    f2=fopen(result,"w");
    fgets(str,1024,f1);
    sscanf(str," %i %*i ",&np);
    fprintf(f2,"%i %i\n",np,1);
    for(i=0;i<np;i++)
    {
        fgets(str,1024,f1);
        sscanf(str," %f %f %f ",&x,&y,&z);
        x/=hdr->pixdim[1];
        y/=hdr->pixdim[2];
        z/=hdr->pixdim[3];
        if(x<0||x>=dim[0]||y<0||y>=dim[1]||z<0||z>=dim[2])
        {
            printf("ERROR: mesh out of volume bounds\n");
            break;
        }
        val=getValue((int)(x+0.5),(int)(y+0.5),(int)(z+0.5));
        fprintf(f2,"%f\n",val);
    }
    fclose(f1);
    fclose(f2);
}
#pragma mark -
#pragma mark [ Format conversion ]
int getformatindex(char *path)
{
    char    *formats[]={"hdr","img","mgz","nii","gz"};
    int     i,n=5; // number of recognised formats
    int     found,index;
    char    *extension;
    
    for(i=strlen(path);i>=0;i--)
        if(path[i]=='.')
            break;
    if(i==0)
    {
        printf("ERROR: Unable to find the format extension\n");
        return 0;
    }
    extension=path+i+1;
    
    for(i=0;i<n;i++)
    {
        found=(strcmp(formats[i],extension)==0);
        if(found)
            break;
    }
    
    index=-1;
    if(i==0 || i==1)
    {
        index=kAnalyzeVolume;
        if(verbose)
            printf("Format: Analyze volume\n");
    }
    else
    if(i==2)
    {
        index=kMGZVolume;
        if(verbose)
            printf("Format: MGZ volume\n");
    }
    else
    if(i==3)
    {
        index=kNiftiVolume;
        if(verbose)
            printf("Format: Nifti volume\n");
    }
    else
    if(i==4)
    {
        index=kNiftiGZVolume;
        if(verbose)
            printf("Format: NiftiGZ volume\n");
    }
    else
    if(i==5)
    {
        index=kNiftiZipVolume;
        if(verbose)
            printf("Format: NiftiZip volume\n");
    }
    else
	{
		printf("ERROR: unrecognized format \"%s\"\n",extension);
		return 0;
	}
	
    return index;
}
int loadVolume_Analyze(char *path)
{
	int		i,sz;
	int		swapped;
	char	*addr;
	char	base[512];
	
	strcpy(base,path);
	for(i=strlen(base);i>=0;i--)
		if(base[i]=='.')
        {
			base[i]=(char)0;
            break;
        }
	sprintf(path,"%s.hdr",base);
	printf("Loading hdr at %s\n",path);
	Analyze_load(path,&addr,&sz,&swapped);
	hdr=(AnalyzeHeader*)addr;
	img=(char*)(addr+sizeof(AnalyzeHeader));
	dim[0]=hdr->dim[1];
	dim[1]=hdr->dim[2];
	dim[2]=hdr->dim[3];
	voxdim[0]=hdr->pixdim[1];
	voxdim[1]=hdr->pixdim[2];
	voxdim[2]=hdr->pixdim[3];
    
	return 0;
}
int saveVolume_Analyze(char *path)
{
	int		i;
	char	base[512];
	
	strcpy(base,path);
	for(i=strlen(base);i>=0;i--)
		if(base[i]=='.')
        {
			base[i]=(char)0;
            break;
        }
	sprintf(path,"%s.hdr",base);
	printf("Saving hdr to %s\n",path);
	Analyze_save_hdr(path,*hdr);
	sprintf(path,"%s.img",base);
	printf("Saving img to %s\n",path);
	Analyze_save_img(path,*hdr,img);
	
	return 0;
}
int loadVolume_MGZ(char *path)
{
    char	*addr;
    int		sz;
    
    MGH_load_GZ(path,&addr,&sz);
    hdr=(AnalyzeHeader*)addr;
    img=(char*)(addr+sizeof(AnalyzeHeader));
    dim[0]=hdr->dim[1];
    dim[1]=hdr->dim[2];
    dim[2]=hdr->dim[3];
    
    return 0;
}
int saveVolume_MGZ(char *path)
{
    printf("Can't save MGZ yet...\n");
    return 0;
}
int loadVolume_Nifti(char *path)
{
    char	*addr;
    int		sz;
    int		swapped;
    
    // load data
    Nifti_load(path, &addr,&sz,&swapped);
    hdr=(AnalyzeHeader*)addr;
    img=(char*)(addr+sizeof(AnalyzeHeader));
    dim[0]=hdr->dim[1];
    dim[1]=hdr->dim[2];
    dim[2]=hdr->dim[3];
    return 0;
}
int saveVolume_Nifti(char *path)
{
    char	*addr=(char*)hdr;
    
    Nifti_save((char*)path, addr);
    
    return 0;
}
int loadVolume_NiftiGZ(char *path)
{
    FILE *f;
    char filename[4096]={0};
    char cmd[4096];

    // create temporary file name
    if(getenv("TEMP")==NULL) strcat(filename,"/tmp");
    else                     strcat(filename,getenv("TEMP"));
    strcat(filename,"/nii.XXXXXX");
    f=mkstemp(filename);
    if((int)f==-1)
    {
        printf("Cannot create temporary file.\n");
        return 1;
    }
    if(verbose)
        printf("Tempname: %s\n",filename);
    
    // uncompress orig.mgz into a temporary .mgh file
    sprintf(cmd,"gunzip -c %s > %s",path,filename);
    system(cmd);
    
    // load temporary file
    loadVolume_Nifti(filename);

    // clean up
    sprintf(cmd,"/bin/rm -r %s",filename);
    system(cmd);

    return 0;
}
int saveVolume_NiftiGZ(char *path)
{
    char	*addr=(char*)hdr;
    char    cmd[4096];
    
    Nifti_save((char*)path, addr);
    
    sprintf(cmd,"/usr/bin/gzip -f %s;/bin/mv %s.gz %s",path,path,path);
    system(cmd);

    return 0;
}
int loadVolume_NiftiZip(char *path)
{
    FILE *f;
    char filename[4096]={0};
    char cmd[4096];

    // create temporary file name
    if(getenv("TEMP")==NULL) strcat(filename,"/tmp");
    else                     strcat(filename,getenv("TEMP"));
    strcat(filename,"/nii.XXXXXX");
    f=mkstemp(filename);
    if((int)f==-1)
    {
        printf("Cannot create temporary file.\n");
        return 1;
    }
    if(verbose)
        printf("Tempname: %s\n",filename);
    
    // uncompress orig.mgz into a temporary .mgh file
    sprintf(cmd,"unzip -p %s > %s",path,filename);
    system(cmd);
    
    // load temporary file
    loadVolume_Nifti(filename);

    // clean up
    sprintf(cmd,"/bin/rm -r %s",filename);
    system(cmd);

    return 0;
}
int loadVolume(char *path)
{
	int	err,format;
	
	format=getformatindex(path);
	
	switch(format)
	{
		case kAnalyzeVolume:
			err=loadVolume_Analyze(path);
			break;
        case kMGZVolume:
            err=loadVolume_MGZ(path);
            break;
        case kNiftiVolume:
            err=loadVolume_Nifti(path);
            break;
        case kNiftiGZVolume:
            err=loadVolume_NiftiGZ(path);
            break;
        case kNiftiZipVolume:
            err=loadVolume_NiftiZip(path);
            break;
		default:
			printf("ERROR: Input volume format not recognised\n");
			return 1;			
	}
	if(err!=0)
	{
		printf("ERROR: cannot read file: %s\n",path);
		return 1;
	}
	return 0;
}
int saveVolume(char *path)
{
	int	format;
	
	format=getformatindex(path);
    printf("[saveVolume] format index: %i\n",format);
	
	switch(format)
	{
		case kAnalyzeVolume:
			saveVolume_Analyze(path);
			break;
        case kMGZVolume:
            saveVolume_MGZ(path);
            break;
        case kNiftiVolume:
            saveVolume_Nifti(path);
            break;
        case kNiftiGZVolume:
            saveVolume_NiftiGZ(path);
            break;
		default:
			printf("ERROR: Output volume format not recognised\n");
			break;
	}
	return 0;
}


/*
-i str                          input volume
-o  str                         output volume
-largest6con                    largest 6 connected component
-dilate int                     dilate(size)
-erode  int                     erode(size)
-compress   float str           cosinus transform compress rate coeff_file
-hist   int                     hist(#bins)
-matchHist  str                 matchHistogram(another_mri)
-stats                          stats, returns mean, std, min, max
-tiff   str str                 write slice as tiff file
-info                           information: dimensions, data type, pixel size
-threshold  float int           threshold(level,direction)
-volume                         calculate volume
-zigzag                         print volume values in zigzag order
-decompose  str                 decompose(basename) a volume with many values into volumes with one single value
-strokeMesh str                 set the vertices of the mesh (text format) at input path to value=max+1
-surfaceNets level path         extract isosurface from the volume at the indicated level using the surface nets algorithm, save at the indicated path
 -sampleMesh str1 str2           sampleMesh(mesh_path, result_path) save the volume values at the vertices of the mesh pointed by the file path to the result path
*/

#pragma mark -
int main (int argc, const char * argv[])
{
	printf("%s\n",version);
	
	checkEndianness();
	
	// This command performs different computations and
	// analyses in volume data.
	// The operations are carried out in the order they
	// appear in the arguments passed to the command
	
	int		i;
	

	for(i=1;i<argc;i++)
	{		
		if(strcmp(argv[i],"-i")==0)				// input volume
		{
			loadVolume((char*)argv[++i]);
		}
		else
		if(strcmp(argv[i],"-o")==0)				// output volume
		{
			saveVolume((char*)argv[++i]);
		}
		else
		if(strcmp(argv[i],"-largest6con")==0)	// largest 6 connected component
		{
			largestConnected();
		}
		else
		if(strcmp(argv[i],"-dilate")==0)		// dilate(size)
		{
			int		size;
			sscanf(argv[++i]," %i ",&size);
			dilate(size);
		}
		else
		if(strcmp(argv[i],"-erode")==0)			// erode(size)
		{
			int		size;
			sscanf(argv[++i]," %i ",&size);
			erode(size);
		}
		else
        if(strcmp(argv[i],"-compress")==0)			// compress rate coeff_file
        {
            float		rate;
            char		coeff[4096];
            sscanf(argv[++i]," %f ",&rate);
            sscanf(argv[++i]," %s ",coeff);
            compress(rate,coeff);
        }
        else
        if(strcmp(argv[i],"-convert")==0)			// convert data type to uchar, short, int or float
        {
            char		dtype[4096];
            sscanf(argv[++i]," %s ",dtype);
            convert(dtype);
        }
        else
		if(strcmp(argv[i],"-hist")==0)				// hist(#bins)
		{
			int		nbins;
			sscanf(argv[++i]," %i ",&nbins);
			hist(nbins);
		}
		else
		if(strcmp(argv[i],"-matchHist")==0)				// matchHistogram(another_mri)
		{
			matchHistogram((char*)argv[++i]);
		}
		else
		if(strcmp(argv[i],"-stats")==0)				// stats, returns mean, std, min, max
		{
			float	x=mean();
			float	s=std();
			float	mi=min();
			float	ma=max();
			
			printf("mean %g\nstd %g\nmin %g\nmax %g\n",x,s,mi,ma);
		}
		else
		if(strcmp(argv[i],"-tiff")==0)				// write slice as tiff file
		{
			char	*path=(char*)argv[i+1];
            char	*cmap=(char*)argv[i+2];
            char	*ori=(char*)argv[i+3];
            drawSlice(path,cmap,ori);
			i+=3;
		}
		else
		if(strcmp(argv[i],"-info")==0)				// information: dimensions, data type, pixel size
		{
            printf("dim: %i %i %i\n",hdr->dim[1],hdr->dim[2],hdr->dim[3]);
			printf("dataType: ");
			switch(hdr->datatype)
			{	case UCHAR:		printf("uchar\n"); break;
				case SHORT:		printf("short\n"); break;
				case FLOAT:		printf("float\n"); break;
				case INT:		printf("int\n"); break;
				case RGB:		printf("rgb\n"); break;
				case RGBFLOAT:	printf("rgbfloat\n"); break;
			}
			printf("voxelSize: %g %g %g\n",hdr->pixdim[1],hdr->pixdim[2],hdr->pixdim[3]);
		}
		else
		if(strcmp(argv[i],"-threshold")==0)				// threshold(level,direction)
		{
			float	level;
			int		direction;
			sscanf(argv[++i]," %f , %i ",&level,&direction);
			threshold(level,direction);
		}
		else
        if(strcmp(argv[i],"-volume")==0)				// calculate volume
        {
            float	vol=volume();
            printf("volume=%g\n",vol);
        }
        else
        if(strcmp(argv[i],"-zigzag")==0)				// print volume values in zigzag order
        {
            zigzag();
        }
        else
		if(strcmp(argv[i],"-decompose")==0)		// decompose(basename) a volume with many values into volumes with one single value
		{
			decompose((char*)argv[++i]);
		}
        else
        if(strcmp(argv[i],"-strokeMesh")==0)		// strokeMesh(path) set the vertices of the mesh (text format) at input path to value=max+1
        {
            strokeMesh((char*)argv[++i]);
        }
        else
        if(strcmp(argv[i],"-surfaceNets")==0)		// extract isosurface from the volume at the indicated level using the surface nets algorithm, save at the indicated path
        {
            float level=atof(argv[++i]);
            char *path=(char*)argv[++i];
            Mesh	m;
            FILE *f;
            surfaceNets_init();
            surfaceNets(level,&m,0);	// 1st pass: evaluate memory requirements
            m.p=(float3D*)calloc(m.np,sizeof(float3D));
            m.t=(int3D*)calloc(m.nt,sizeof(int3D));
            surfaceNets(level,&m,1);	// 2nd pass: store vertices and triangles
            
            f=fopen(path,"w");
            fprintf(f,"%i %i\n",m.np,m.nt);
            for(i=0;i<m.np;i++)
                fprintf(f,"%f %f %f\n",m.p[i].x*hdr->pixdim[1],m.p[i].y*hdr->pixdim[2],m.p[i].z*hdr->pixdim[3]);
            for(i=0;i<m.nt;i++)
                fprintf(f,"%i %i %i\n",m.t[i].a,m.t[i].b,m.t[i].c);
            fclose(f);
        }
        else
        if(strcmp(argv[i],"-sampleMesh")==0)		// sampleMesh(mesh_path, result_path) save the volume values at the vertices of the mesh pointed by the file path to the result path
        {
            char    *mesh_path=(char*)argv[++i];
            char    *result_path=(char*)argv[++i];
            sampleMesh(mesh_path,result_path);
        }
	}
    return 0;
}
