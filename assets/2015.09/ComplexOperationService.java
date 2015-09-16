package com.cacoveanu.makeitso.remoting;

/**
 * Created by scacoveanu on 3/7/2015.
 */
public interface ComplexOperationService {

    String sayHello(String name);

    Long complexOperation(Long split) throws InterruptedException;

    void cancelComplexOperation();
}
