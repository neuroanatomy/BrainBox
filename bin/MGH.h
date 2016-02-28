/*
 *  MGH.c
 *
 *  Created by rOBERTO tORO on 23/02/2009.
 *  Copyright 2009 __MyCompanyName__. All rights reserved.
 *
 */
#ifndef __MGH__
#define __MGH__

#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include "Analyze.h"
#include <sys/types.h>
#include <unistd.h>
#include <time.h>

#define kORIG	1
#define kNU		2
#define kBRAIN	3
#define kASEG	4
#define kFILLED	5
#define kT1		6

typedef struct
{
	int		version;
	int		ndim1;
    int		ndim2;
	int		ndim3;
	int		nframes;
	int		type;
	int		dof;
	
    short   goodRASFlag;    // if true, the direction cosines, which will be detailed next, are in the header; if false, a CORONAL orientation will be assumed
    float   spacingX;       // spacing in the X direction (ranging [0...width]) - default is 1
    float   spacingY;       // spacing in the Y direction (ranging [0...height]) - default is 1
    float   spacingZ;       // spacing in the Z direction (ranging [0...depth]) - default is 1
    float   xr;             // default is -1
    float   xa;             // default is 0
    float   xs;             // default is 0
    float   yr;             // default is 0
    float   ya;             // default is 0
    float   ys;             // default is -1
    float   zr;             // default is 0
    float   za;             // default is 1
    float   zs;             // default is 0
    float   cr;             // default is 0
    float   ca;             // default is 0
    float   cs;             // default is 0
	
	char	ignore[192];	// total header size has to be 284
}MGHHeader;

void MGH_load(char *path, char **vol,int *sz, int volumeType);
void MGH_load_GZ(char *path, char **vol,int *sz);

#endif
